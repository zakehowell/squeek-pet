//! HUD geometry uses physical screen pixels, including negative monitor origins.

#[derive(Clone, Copy, Debug)]
pub(crate) struct Bounds {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum Side {
    Above,
    Below,
}

impl Side {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Above => "above",
            Self::Below => "below",
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct Placement {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
    pub side: Side,
    pub max_height: f64,
}

/// Prefer above; at the top edge the HUD goes below without moving the pet.
pub(crate) fn place(pet: Bounds, work: Bounds, width: f64, height: f64, gap: f64) -> Placement {
    let above = (pet.y - work.y - gap).max(0.0);
    let below = (work.y + work.height - pet.y - pet.height - gap).max(0.0);
    let side = if height <= above {
        Side::Above
    } else if height <= below {
        Side::Below
    } else if above >= below {
        Side::Above
    } else {
        Side::Below
    };
    let max_height = match side {
        Side::Above => above,
        Side::Below => below,
    }
    .max(1.0)
    .min(work.height);
    let width = width.max(1.0).min(work.width).floor();
    let height = height.max(1.0).min(max_height).floor();
    let x = (pet.x + (pet.width - width) / 2.0).clamp(work.x, work.x + work.width - width);
    let y = match side {
        Side::Above => pet.y - gap - height,
        Side::Below => pet.y + pet.height + gap,
    }
    .clamp(work.y, work.y + work.height - height);
    Placement {
        x: x.round() as i32,
        y: y.round() as i32,
        width: width as u32,
        height: height as u32,
        side,
        max_height,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const WORK: Bounds = Bounds {
        x: 0.0,
        y: 25.0,
        width: 1440.0,
        height: 850.0,
    };

    #[test]
    fn top_edge_puts_hud_below_without_reserving_space_above_pet() {
        let pet = Bounds {
            x: 400.0,
            y: 25.0,
            width: 240.0,
            height: 161.0,
        };
        let hud = place(pet, WORK, 240.0, 160.0, 8.0);
        assert_eq!(hud.side, Side::Below);
        assert_eq!(hud.y, 194);
        assert_eq!(hud.height, 160);
    }

    #[test]
    fn bottom_edge_prefers_above() {
        let pet = Bounds {
            x: 400.0,
            y: 714.0,
            width: 240.0,
            height: 161.0,
        };
        let hud = place(pet, WORK, 240.0, 200.0, 8.0);
        assert_eq!(hud.side, Side::Above);
        assert_eq!(hud.y, 506);
    }

    #[test]
    fn tall_panel_uses_larger_side_and_is_clipped_to_work_area() {
        let pet = Bounds {
            x: 400.0,
            y: 400.0,
            width: 240.0,
            height: 161.0,
        };
        let hud = place(pet, WORK, 240.0, 700.0, 8.0);
        assert_eq!(hud.side, Side::Above);
        assert_eq!(hud.max_height, 367.0);
        assert_eq!(hud.height, 367);
        assert_eq!(hud.y, 25);
    }

    #[test]
    fn negative_monitor_origins_and_wider_hud_stay_on_the_selected_monitor() {
        let work = Bounds {
            x: -1920.0,
            y: -900.0,
            width: 1920.0,
            height: 1080.0,
        };
        let pet = Bounds {
            x: -1900.0,
            y: -500.0,
            width: 240.0,
            height: 161.0,
        };
        let hud = place(pet, work, 450.0, 240.0, 8.0);
        assert_eq!(hud.x, -1920);
        assert_eq!(hud.side, Side::Above);
        assert!(hud.y >= -900);
        assert!(hud.x + hud.width as i32 <= 0);
    }

    #[test]
    fn oversized_hud_is_constrained_on_both_axes() {
        let pet = Bounds {
            x: 1400.0,
            y: 25.0,
            width: 40.0,
            height: 161.0,
        };
        let hud = place(pet, WORK, 2000.0, 3000.0, 8.0);
        assert_eq!(hud.side, Side::Below);
        assert_eq!(hud.x, 0);
        assert_eq!(hud.width, 1440);
        assert_eq!(hud.y + hud.height as i32, 875);
    }
}
