// Desktop shell for Squeek Pet: a transparent, always-on-top pet window that
// lets clicks through everywhere except the pet, a tray menu, and a settings
// window. All wheel data handling lives in the web front end.

mod hud_position;

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{
    AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, PhysicalSize, RunEvent, WebviewUrl,
    WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry,
};
use tauri_plugin_window_state::{StateFlags, WindowExt};

const PET: &str = "pet";
const HUD: &str = "hud";
const SETTINGS: &str = "settings";
/// How often the pointer is checked against the pet's clickable areas.
const CURSOR_POLL: Duration = Duration::from_millis(33);

static PET_VISIBLE: AtomicBool = AtomicBool::new(false);

/// A clickable area of the pet window, in logical pixels from its top-left corner.
#[derive(Clone, Copy, Debug, Deserialize)]
struct Rect {
    x: f64,
    y: f64,
    w: f64,
    h: f64,
}

impl Rect {
    fn contains(&self, x: f64, y: f64) -> bool {
        x >= self.x && x <= self.x + self.w && y >= self.y && y <= self.y + self.h
    }
}

#[derive(Default)]
struct HitRegions(Mutex<HashMap<String, Vec<Rect>>>);

#[derive(Default)]
struct HudState(Mutex<HudData>);

#[derive(Default)]
struct HudData {
    payload: Option<Value>,
    width: f64,
    height: f64,
    placement: Option<HudPlacement>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
struct HudPlacement {
    side: &'static str,
    max_height: f64,
}

#[derive(Clone, Serialize)]
struct CursorEvent {
    x: f64,
    y: f64,
    inside: bool,
}

struct TrayItems {
    toggle: MenuItem<Wry>,
    details: MenuItem<Wry>,
    world: MenuItem<Wry>,
    demo: CheckMenuItem<Wry>,
    settings: MenuItem<Wry>,
    quit: MenuItem<Wry>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct TrayLabels {
    toggle: String,
    details: String,
    world: String,
    demo: String,
    settings: String,
    quit: String,
    demo_on: bool,
}

#[tauri::command]
fn set_hit_regions(window: WebviewWindow, regions: tauri::State<'_, HitRegions>, rects: Vec<Rect>) {
    if window.label() != PET && window.label() != HUD {
        return;
    }
    if let Ok(mut current) = regions.0.lock() {
        let rects = rects
            .into_iter()
            .filter(|r| {
                [r.x, r.y, r.w, r.h].iter().all(|n| n.is_finite())
                    && r.w > 0.0
                    && r.h > 0.0
                    && r.w <= 4096.0
                    && r.h <= 4096.0
            })
            .take(64)
            .collect();
        current.insert(window.label().to_string(), rects);
    }
}

#[tauri::command]
fn update_hud(
    window: WebviewWindow,
    app: AppHandle,
    state: tauri::State<'_, HudState>,
    payload: Value,
) -> Result<(), String> {
    if window.label() != PET {
        return Err("Only the pet window can update its HUD".into());
    }
    {
        let mut data = state.0.lock().map_err(|e| e.to_string())?;
        data.payload = Some(payload.clone());
    }
    app.emit_to(HUD, "pet://hud-state", payload)
        .map_err(|e| e.to_string())?;
    sync_hud(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn hud_ready(
    window: WebviewWindow,
    app: AppHandle,
    state: tauri::State<'_, HudState>,
) -> Result<(), String> {
    if window.label() != HUD {
        return Err("Only the HUD window can signal readiness".into());
    }
    let (payload, placement) = {
        let data = state.0.lock().map_err(|e| e.to_string())?;
        (data.payload.clone(), data.placement.clone())
    };
    if let Some(payload) = payload {
        app.emit_to(HUD, "pet://hud-state", payload)
            .map_err(|e| e.to_string())?;
    }
    if let Some(placement) = placement {
        app.emit_to(HUD, "pet://hud-placement", placement)
            .map_err(|e| e.to_string())?;
    }
    sync_hud(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn resize_hud(
    window: WebviewWindow,
    app: AppHandle,
    state: tauri::State<'_, HudState>,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if window.label() != HUD || !valid_size(width, height, true) {
        return Err("Invalid HUD size".into());
    }
    {
        let mut data = state.0.lock().map_err(|e| e.to_string())?;
        data.width = width;
        data.height = height;
    }
    sync_hud(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn hud_action(window: WebviewWindow, app: AppHandle, action: Value) -> Result<(), String> {
    if window.label() != HUD {
        return Err("Only the HUD window can send HUD actions".into());
    }
    app.emit_to(PET, "pet://hud-action", action)
        .map_err(|e| e.to_string())
}

fn valid_size(width: f64, height: f64, allow_hidden: bool) -> bool {
    width.is_finite()
        && height.is_finite()
        && (1.0..=4096.0).contains(&width)
        && height >= if allow_hidden { 0.0 } else { 1.0 }
        && height <= 8192.0
}

/// Older versions saved POSITION only, leaving dimensions at zero in the
/// plugin's cache. Restore those positions without applying a 0 x 0 size.
fn geometry_restore_flags(saved: Option<&Value>) -> StateFlags {
    let valid = |name: &str, max: u64| {
        saved
            .and_then(|state| state.get(name))
            .and_then(Value::as_u64)
            .is_some_and(|size| size > 0 && size <= max)
    };
    if valid("width", 16384) && valid("height", 32768) {
        StateFlags::POSITION | StateFlags::SIZE
    } else {
        StateFlags::POSITION
    }
}

fn bottom_right_origin(
    position: PhysicalPosition<i32>,
    current: PhysicalSize<u32>,
    next: PhysicalSize<u32>,
) -> PhysicalPosition<i32> {
    PhysicalPosition::new(
        position.x + current.width as i32 - next.width as i32,
        position.y + current.height as i32 - next.height as i32,
    )
}

/// Call on the main thread only: `restore_state` holds the window-state
/// plugin's lock while it waits for the main thread.
fn restore_window_geometry(window: &WebviewWindow) -> tauri::Result<()> {
    let saved = window
        .app_handle()
        .path()
        .app_config_dir()
        .ok()
        .and_then(|dir| std::fs::read(dir.join(tauri_plugin_window_state::DEFAULT_FILENAME)).ok())
        .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok());
    window.restore_state(geometry_restore_flags(
        saved.as_ref().and_then(|states| states.get(window.label())),
    ))
}

/// Read state under the lock, then perform native window operations without it.
fn sync_hud(app: &AppHandle) -> tauri::Result<()> {
    let (Some(pet), Some(hud)) = (app.get_webview_window(PET), app.get_webview_window(HUD)) else {
        return Ok(());
    };
    let (width, height) = {
        let state = app.state::<HudState>();
        let data = state.0.lock().unwrap_or_else(|e| e.into_inner());
        (data.width, data.height)
    };
    if !PET_VISIBLE.load(Ordering::Relaxed) || height <= 0.0 {
        if hud.is_visible()? {
            hud.hide()?;
        }
        return Ok(());
    }
    let Some(monitor) = pet.current_monitor()?.or(app.primary_monitor()?) else {
        return Ok(());
    };
    let scale = monitor.scale_factor();
    let area = monitor.work_area();
    let origin = pet.outer_position()?;
    let size = pet.outer_size()?;
    let placement = hud_position::place(
        hud_position::Bounds {
            x: origin.x as f64,
            y: origin.y as f64,
            width: size.width as f64,
            height: size.height as f64,
        },
        hud_position::Bounds {
            x: area.position.x as f64,
            y: area.position.y as f64,
            width: area.size.width as f64,
            height: area.size.height as f64,
        },
        width * scale,
        height * scale,
        8.0 * scale,
    );
    let next_size = PhysicalSize::new(placement.width, placement.height);
    let next_position = PhysicalPosition::new(placement.x, placement.y);
    if hud.outer_position()? != next_position {
        hud.set_position(next_position)?;
    }
    if hud.outer_size()? != next_size {
        hud.set_size(next_size)?;
    }
    let event = HudPlacement {
        side: placement.side.as_str(),
        max_height: placement.max_height / scale,
    };
    let changed = {
        let state = app.state::<HudState>();
        let mut data = state.0.lock().unwrap_or_else(|e| e.into_inner());
        if data.placement.as_ref() == Some(&event) {
            false
        } else {
            data.placement = Some(event.clone());
            true
        }
    };
    if changed {
        app.emit_to(HUD, "pet://hud-placement", event)?;
    }
    if !hud.is_visible()? {
        hud.show()?;
    }
    Ok(())
}

#[tauri::command]
fn set_pet_always_on_top(window: WebviewWindow, app: AppHandle, on: bool) -> Result<(), String> {
    if window.label() != PET {
        return Err("Only the pet window can change its window level".into());
    }
    window.set_always_on_top(on).map_err(|e| e.to_string())?;
    if let Some(hud) = app.get_webview_window(HUD) {
        hud.set_always_on_top(on).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_tray_labels(items: tauri::State<'_, TrayItems>, labels: TrayLabels) -> Result<(), String> {
    let result = (|| -> tauri::Result<()> {
        items.toggle.set_text(labels.toggle)?;
        items.details.set_text(labels.details)?;
        items.world.set_text(labels.world)?;
        items.demo.set_text(labels.demo)?;
        items.demo.set_checked(labels.demo_on)?;
        items.settings.set_text(labels.settings)?;
        items.quit.set_text(labels.quit)
    })();
    result.map_err(|e| e.to_string())
}

/// Resizes the pet window and keeps its bottom-right corner in place, which is
/// where the pet stands.
#[tauri::command]
fn resize_pet(
    window: WebviewWindow,
    app: AppHandle,
    width: f64,
    height: f64,
) -> Result<(), String> {
    if window.label() != PET || !valid_size(width, height, false) {
        return Err("Invalid pet size".into());
    }
    let result = (|| -> tauri::Result<()> {
        let scale = window.scale_factor()?;
        let position = window.outer_position()?;
        let size = window.outer_size()?;
        let next = LogicalSize::new(width, height).to_physical::<u32>(scale);
        if next == size {
            return Ok(());
        }
        let next_origin = bottom_right_origin(position, size, next);
        window.set_size(next)?;
        window.set_position(next_origin)?;
        sync_hud(&app)
    })();
    result.map_err(|e| e.to_string())
}

/// Async on purpose: Tauri runs synchronous commands on the main thread, and
/// on Windows WebView2 can't create a webview from there. The new window then
/// stays blank white and the whole app hangs (tauri-apps/wry#583).
#[tauri::command]
async fn open_settings(app: AppHandle) -> Result<(), String> {
    show_settings(&app).map_err(|e| e.to_string())
}

#[tauri::command]
fn hide_pet(app: AppHandle) {
    set_pet_visible(&app, false);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn set_pet_visible(app: &AppHandle, visible: bool) {
    if let Some(window) = app.get_webview_window(PET) {
        let result = if visible {
            window.show()
        } else {
            window.hide()
        };
        if result.is_ok() {
            PET_VISIBLE.store(visible, Ordering::Relaxed);
            let _ = sync_hud(app);
        }
    }
}

fn toggle_pet(app: &AppHandle) {
    set_pet_visible(app, !PET_VISIBLE.load(Ordering::Relaxed));
}

/// Shows the settings window, creating it if needed. Never call this on the
/// main thread (commands without `async`, menu and window event handlers):
/// see `open_settings`. `restore_window_geometry` on the other hand must run
/// on the main thread once the window exists; see below.
fn show_settings(app: &AppHandle) -> tauri::Result<()> {
    // Two quick requests must not both try to create the window.
    static OPENING: Mutex<()> = Mutex::new(());
    let _opening = OPENING.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(window) = app.get_webview_window(SETTINGS) {
        window.unminimize()?;
        window.show()?;
        return window.set_focus();
    }
    let window = WebviewWindowBuilder::new(app, SETTINGS, WebviewUrl::App("settings.html".into()))
        .title("Squeek Pet")
        .inner_size(420.0, 700.0)
        .min_inner_size(360.0, 480.0)
        .center()
        .build()?;
    // Restore on the main thread. The window-state plugin keeps its cache
    // locked while restore_state waits for the main thread to move the window,
    // and the main thread locks the same cache when it announces a new window.
    // Restoring from this thread deadlocked the whole app on Windows.
    let restored = window.clone();
    window.run_on_main_thread(move || {
        if let Err(error) = restore_window_geometry(&restored) {
            eprintln!("[squeek-pet] could not restore the settings window: {error}");
        }
        let _ = restored.set_focus();
    })
}

/// Creates the pet window in the bottom-right corner of the primary screen.
/// The window-state plugin then moves it to the last saved spot, if that
/// spot is still on a connected screen.
fn create_pet(app: &AppHandle) -> tauri::Result<()> {
    let config = app
        .config()
        .app
        .windows
        .iter()
        .find(|w| w.label == PET)
        .cloned()
        .expect("tauri.conf.json defines the pet window");
    let mut builder = WebviewWindowBuilder::from_config(app, &config)?;
    if let Some(monitor) = app.primary_monitor()? {
        let scale = monitor.scale_factor();
        let area = monitor.work_area();
        let right = (area.position.x as f64 + area.size.width as f64) / scale;
        let bottom = (area.position.y as f64 + area.size.height as f64) / scale;
        builder = builder.position(right - config.width - 24.0, bottom - config.height);
    }
    let window = builder.build()?;
    // Persist the scene-only size together with its origin. Recreating the old
    // 380px window on every launch would make the first bottom-anchored resize
    // move the pet down by the removed HUD space on every restart.
    restore_window_geometry(&window)?;
    set_pet_visible(app, true);
    Ok(())
}

/// The pet's native window contains only its scene. Cards live in their own
/// window so a hidden card never reserves space above a pet at the screen edge.
fn create_hud(app: &AppHandle) -> tauri::Result<()> {
    let on_top = app
        .get_webview_window(PET)
        .map(|pet| pet.is_always_on_top())
        .transpose()?
        .unwrap_or(true);
    let hud = WebviewWindowBuilder::new(app, HUD, WebviewUrl::App("hud.html".into()))
        .title("Squeek Pet status")
        .inner_size(300.0, 1.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(on_top)
        .skip_taskbar(true)
        .visible_on_all_workspaces(true)
        .focused(false)
        .focusable(false)
        .accept_first_mouse(true)
        .visible(false)
        .build()?;
    hud.set_ignore_cursor_events(true)?;
    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let toggle = MenuItem::with_id(app, "toggle", "Show / Hide Squeek Pet", true, None::<&str>)?;
    let details = MenuItem::with_id(app, "details", "Show details", true, None::<&str>)?;
    let world = MenuItem::with_id(app, "world", "Open Squeek Pet World", true, None::<&str>)?;
    let demo = CheckMenuItem::with_id(app, "demo", "Demo mode", true, false, None::<&str>)?;
    let settings = MenuItem::with_id(app, "settings", "Settings…", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit Squeek Pet", true, None::<&str>)?;
    let menu = Menu::with_items(
        app,
        &[
            &toggle,
            &details,
            &world,
            &PredefinedMenuItem::separator(app)?,
            &demo,
            &settings,
            &PredefinedMenuItem::separator(app)?,
            &quit,
        ],
    )?;

    let mut tray = TrayIconBuilder::with_id("squeek-pet")
        .tooltip("Squeek Pet")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_pet(app),
            "details" => {
                set_pet_visible(app, true);
                let _ = app.emit_to(PET, "pet://menu", "details");
            }
            // Squeek Pet World is a web page; the pet window opens it in the browser.
            "world" => {
                let _ = app.emit_to(PET, "pet://menu", "world");
            }
            // The pet window owns the setting; it updates the check mark back.
            "demo" => {
                let _ = app.emit_to(PET, "pet://menu", "demo");
            }
            // Menu handlers run on the main thread; see show_settings.
            "settings" => {
                let app = app.clone();
                std::thread::spawn(move || {
                    if let Err(error) = show_settings(&app) {
                        eprintln!("[squeek-pet] could not open settings: {error}");
                    }
                });
            }
            "quit" => app.exit(0),
            _ => {}
        });

    // macOS menu bar icons are monochrome templates; elsewhere use the app icon.
    #[cfg(target_os = "macos")]
    {
        tray = tray
            .icon(tauri::image::Image::from_bytes(include_bytes!(
                "../icons/tray-template.png"
            ))?)
            .icon_as_template(true);
    }
    #[cfg(not(target_os = "macos"))]
    {
        if let Some(icon) = app.default_window_icon() {
            tray = tray.icon(icon.clone());
        }
    }

    tray.build(app)?;
    app.manage(TrayItems {
        toggle,
        details,
        world,
        demo,
        settings,
        quit,
    });
    Ok(())
}

/// Makes the transparent parts of the pet window click-through. The pointer is
/// checked against the clickable areas the front end reports; mouse events
/// are only caught while the pointer is over one of them. The pointer
/// position is also forwarded so the hamster can look at it.
fn watch_cursor(app: AppHandle) {
    std::thread::spawn(move || {
        let mut ignoring: HashMap<&str, bool> = HashMap::new();
        let mut last: Option<(i64, i64, bool)> = None;
        loop {
            std::thread::sleep(CURSOR_POLL);
            if !PET_VISIBLE.load(Ordering::Relaxed) {
                continue;
            }
            let Ok(cursor) = app.cursor_position() else {
                continue;
            };
            for label in [PET, HUD] {
                let Some(window) = app.get_webview_window(label) else {
                    continue;
                };
                if label == HUD && !window.is_visible().unwrap_or(false) {
                    continue;
                }
                let (Ok(origin), Ok(scale)) = (window.inner_position(), window.scale_factor())
                else {
                    continue;
                };
                let x = (cursor.x - origin.x as f64) / scale;
                let y = (cursor.y - origin.y as f64) / scale;
                let inside = app
                    .state::<HitRegions>()
                    .0
                    .lock()
                    .map(|windows| {
                        windows
                            .get(label)
                            .is_some_and(|rects| rects.iter().any(|r| r.contains(x, y)))
                    })
                    .unwrap_or(false);
                if ignoring.get(label) != Some(&!inside)
                    && window.set_ignore_cursor_events(!inside).is_ok()
                {
                    ignoring.insert(label, !inside);
                }
                if label == PET {
                    let key = (x.round() as i64, y.round() as i64, inside);
                    if last != Some(key) {
                        last = Some(key);
                        let _ = app.emit_to(PET, "pet://cursor", CursorEvent { x, y, inside });
                    }
                }
            }
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            set_pet_visible(app, true);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .with_denylist(&[HUD])
                .skip_initial_state(PET)
                .skip_initial_state(SETTINGS)
                .build(),
        )
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_opener::init())
        .manage(HitRegions::default())
        .manage(HudState::default())
        .invoke_handler(tauri::generate_handler![
            set_hit_regions,
            set_tray_labels,
            resize_pet,
            update_hud,
            hud_ready,
            resize_hud,
            hud_action,
            set_pet_always_on_top,
            open_settings,
            hide_pet,
            quit_app
        ])
        .setup(|app| {
            // A desktop pet lives in the menu bar, not the Dock.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);
            let handle = app.handle().clone();
            build_tray(&handle)?;
            create_pet(&handle)?;
            create_hud(&handle)?;
            watch_cursor(handle);
            Ok(())
        })
        .on_window_event(|window, event| {
            let pet_geometry_changed = window.label() == PET
                && matches!(
                    event,
                    WindowEvent::Moved(_)
                        | WindowEvent::Resized(_)
                        | WindowEvent::ScaleFactorChanged { .. }
                );
            let hud_scale_changed =
                window.label() == HUD && matches!(event, WindowEvent::ScaleFactorChanged { .. });
            if pet_geometry_changed || hud_scale_changed {
                let _ = sync_hud(window.app_handle());
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building Squeek Pet");

    app.run(|app, event| {
        // Closing the settings window must not quit the pet.
        if let RunEvent::ExitRequested {
            code: None, api, ..
        } = event
        {
            if app.get_webview_window(PET).is_some() {
                api.prevent_exit();
            }
        }
    });
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn legacy_position_only_state_never_restores_a_zero_sized_window() {
        let legacy = json!({ "width": 0, "height": 0, "x": 500, "y": 40 });
        let flags = geometry_restore_flags(Some(&legacy));
        assert!(flags.contains(StateFlags::POSITION));
        assert!(!flags.contains(StateFlags::SIZE));
        assert!(!geometry_restore_flags(None).contains(StateFlags::SIZE));
    }

    #[test]
    fn scene_only_dimensions_are_restored_together_with_their_origin() {
        let saved = json!({ "width": 480, "height": 322, "x": 500, "y": 40 });
        assert!(
            geometry_restore_flags(Some(&saved)).contains(StateFlags::POSITION | StateFlags::SIZE)
        );
        let malformed = json!({ "width": 480, "height": -322 });
        assert!(!geometry_restore_flags(Some(&malformed)).contains(StateFlags::SIZE));
    }

    #[test]
    fn migration_preserves_the_bottom_edge_once_and_restarts_do_not_drift() {
        let old_size = PhysicalSize::new(600, 760);
        let scene_size = PhysicalSize::new(480, 322);
        let old_origin = PhysicalPosition::new(1200, 100);
        let migrated = bottom_right_origin(old_origin, old_size, scene_size);
        assert_eq!(migrated.y + scene_size.height as i32, 860);
        // The plugin now restores scene_size rather than the config's old
        // 380px height. Neither the next launch nor later launches move it.
        let first_restart = bottom_right_origin(migrated, scene_size, scene_size);
        let second_restart = bottom_right_origin(first_restart, scene_size, scene_size);
        assert_eq!(first_restart, migrated);
        assert_eq!(second_restart, migrated);
    }
}
