#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState, Modifiers, Code};
use std::collections::HashMap;
use std::sync::Mutex;

pub struct ShortcutRegistry {
    shortcuts: Mutex<HashMap<String, String>>,
    codes: Mutex<HashMap<String, String>>,
    registered: Mutex<Vec<Shortcut>>,
}

pub struct AppState {
    timer_active: Mutex<bool>,
}

#[tauri::command]
fn set_timer_state(app: tauri::AppHandle, active: bool) {
    let state = app.state::<AppState>();
    *state.timer_active.lock().unwrap() = active;
}

#[tauri::command]
async fn resize_for_timer(app: tauri::AppHandle, include_timer: bool) {
    let window = app.get_webview_window("main").unwrap();
    let state = app.state::<AppState>();
    
    // Update the state first
    *state.timer_active.lock().unwrap() = include_timer;
    
    // Get current size
    let size = window.inner_size().unwrap();
    let width = size.width;
    
    // Calculate correct height
    let housing_height = ((width as f32 - 80.0) * 2.0).max(240.0);
    let mut height = 40.0 + 40.0 + housing_height;
    
    if include_timer {
        height += 100.0;
    }
    
    height = height.max(350.0).round();
    
    // Set size
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
        width: width as f64,
        height: height as f64,
    }));
}

#[tauri::command]
fn initialize_shortcuts(
    app: tauri::AppHandle,
    shortcuts: serde_json::Value,
) -> Result<(), String> {
    let registry = app.state::<ShortcutRegistry>();
    let global_shortcut = app.global_shortcut();
    
    {
        let existing = registry.registered.lock().unwrap();
        for shortcut in existing.iter() {
            let _ = global_shortcut.unregister(*shortcut);
        }
    }
    
    let shortcuts_map: HashMap<String, String> = 
        serde_json::from_value(shortcuts).map_err(|e| e.to_string())?;
    
    let mut new_shortcuts = Vec::new();
    {
        let mut reg = registry.shortcuts.lock().unwrap();
        let mut codes = registry.codes.lock().unwrap();
        let mut registered = registry.registered.lock().unwrap();
        
        *reg = shortcuts_map.clone();
        codes.clear();
        registered.clear();
        
        for (action, combo) in &shortcuts_map {
            if let Some(shortcut) = parse_shortcut(combo) {
                codes.insert(combo.clone(), action.clone());
                
                match global_shortcut.register(shortcut) {
                    Ok(_) => {
                        new_shortcuts.push(shortcut);
                    }
                    Err(e) => {
                        println!("Failed to register {}: {}", combo, e);
                    }
                }
            }
        }
        
        *registered = new_shortcuts;
    }
    
    Ok(())
}

#[tauri::command]
fn update_shortcut(
    app: tauri::AppHandle,
    action: String,
    new_combo: String,
) -> Result<(), String> {
    let registry = app.state::<ShortcutRegistry>();
    let global_shortcut = app.global_shortcut();
    
    {
        let mut shortcuts = registry.shortcuts.lock().unwrap();
        let mut codes = registry.codes.lock().unwrap();
        
        if let Some(old_combo) = shortcuts.get(&action) {
            codes.remove(old_combo);
            if let Some(old_shortcut) = parse_shortcut(old_combo) {
                let _ = global_shortcut.unregister(old_shortcut);
                let mut registered = registry.registered.lock().unwrap();
                registered.retain(|s| s != &old_shortcut);
            }
        }
        
        shortcuts.insert(action.clone(), new_combo.clone());
        codes.insert(new_combo.clone(), action);
    }
    
    if let Some(shortcut) = parse_shortcut(&new_combo) {
        global_shortcut.register(shortcut).map_err(|e| e.to_string())?;
        let mut registered = registry.registered.lock().unwrap();
        registered.push(shortcut);
    }
    
    Ok(())
}

fn parse_shortcut(combo: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = combo.split('+').collect();
    let mut modifiers = Modifiers::empty();
    let mut key = None;
    
    for part in parts {
        match part {
            "Alt" => modifiers.insert(Modifiers::ALT),
            "Ctrl" => modifiers.insert(Modifiers::CONTROL),
            "Shift" => modifiers.insert(Modifiers::SHIFT),
            "Cmd" => modifiers.insert(Modifiers::META),
            "Super" => modifiers.insert(Modifiers::META),
            k => key = parse_key(k),
        }
    }
    
    key.map(|k| Shortcut::new(Some(modifiers), k))
}

fn parse_key(key: &str) -> Option<Code> {
    match key {
        "A" => Some(Code::KeyA),
        "B" => Some(Code::KeyB),
        "C" => Some(Code::KeyC),
        "D" => Some(Code::KeyD),
        "E" => Some(Code::KeyE),
        "F" => Some(Code::KeyF),
        "G" => Some(Code::KeyG),
        "H" => Some(Code::KeyH),
        "I" => Some(Code::KeyI),
        "J" => Some(Code::KeyJ),
        "K" => Some(Code::KeyK),
        "L" => Some(Code::KeyL),
        "M" => Some(Code::KeyM),
        "N" => Some(Code::KeyN),
        "O" => Some(Code::KeyO),
        "P" => Some(Code::KeyP),
        "Q" => Some(Code::KeyQ),
        "R" => Some(Code::KeyR),
        "S" => Some(Code::KeyS),
        "T" => Some(Code::KeyT),
        "U" => Some(Code::KeyU),
        "V" => Some(Code::KeyV),
        "W" => Some(Code::KeyW),
        "X" => Some(Code::KeyX),
        "Y" => Some(Code::KeyY),
        "Z" => Some(Code::KeyZ),
        "0" => Some(Code::Digit0),
        "1" => Some(Code::Digit1),
        "2" => Some(Code::Digit2),
        "3" => Some(Code::Digit3),
        "4" => Some(Code::Digit4),
        "5" => Some(Code::Digit5),
        "6" => Some(Code::Digit6),
        "7" => Some(Code::Digit7),
        "8" => Some(Code::Digit8),
        "9" => Some(Code::Digit9),
        "Space" => Some(Code::Space),
        "Enter" => Some(Code::Enter),
        "Return" => Some(Code::Enter),
        "Tab" => Some(Code::Tab),
        "F1" => Some(Code::F1),
        "F2" => Some(Code::F2),
        "F3" => Some(Code::F3),
        "F4" => Some(Code::F4),
        "F5" => Some(Code::F5),
        "F6" => Some(Code::F6),
        "F7" => Some(Code::F7),
        "F8" => Some(Code::F8),
        "F9" => Some(Code::F9),
        "F10" => Some(Code::F10),
        "F11" => Some(Code::F11),
        "F12" => Some(Code::F12),
        _ => None,
    }
}

fn shortcut_to_string(shortcut: &Shortcut) -> String {
    let mut parts = Vec::new();
    let mods = shortcut.mods;
    
    if mods.contains(Modifiers::CONTROL) {
        parts.push("Ctrl");
    }
    if mods.contains(Modifiers::ALT) {
        parts.push("Alt");
    }
    if mods.contains(Modifiers::SHIFT) {
        parts.push("Shift");
    }
    if mods.contains(Modifiers::META) {
        parts.push("Cmd");
    }
    
    let key_str = match shortcut.key {
        Code::KeyA => "A",
        Code::KeyB => "B",
        Code::KeyC => "C",
        Code::KeyD => "D",
        Code::KeyE => "E",
        Code::KeyF => "F",
        Code::KeyG => "G",
        Code::KeyH => "H",
        Code::KeyI => "I",
        Code::KeyJ => "J",
        Code::KeyK => "K",
        Code::KeyL => "L",
        Code::KeyM => "M",
        Code::KeyN => "N",
        Code::KeyO => "O",
        Code::KeyP => "P",
        Code::KeyQ => "Q",
        Code::KeyR => "R",
        Code::KeyS => "S",
        Code::KeyT => "T",
        Code::KeyU => "U",
        Code::KeyV => "V",
        Code::KeyW => "W",
        Code::KeyX => "X",
        Code::KeyY => "Y",
        Code::KeyZ => "Z",
        Code::Digit0 => "0",
        Code::Digit1 => "1",
        Code::Digit2 => "2",
        Code::Digit3 => "3",
        Code::Digit4 => "4",
        Code::Digit5 => "5",
        Code::Digit6 => "6",
        Code::Digit7 => "7",
        Code::Digit8 => "8",
        Code::Digit9 => "9",
        Code::Space => "Space",
        Code::Enter => "Enter",
        Code::Tab => "Tab",
        _ => "",
    };
    
    parts.push(key_str);
    parts.join("+")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(ShortcutRegistry {
            shortcuts: Mutex::new(HashMap::new()),
            codes: Mutex::new(HashMap::new()),
            registered: Mutex::new(Vec::new()),
        })
        .manage(AppState {
            timer_active: Mutex::new(false),
        })
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let combo_str = shortcut_to_string(shortcut);
                        let registry = app.state::<ShortcutRegistry>();
                        let codes = registry.codes.lock().unwrap();
                        
                        if let Some(action) = codes.get(&combo_str) {
                            let _ = app.emit::<String>("shortcut-triggered", action.clone());
                        }
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
			initialize_shortcuts, 
			update_shortcut,
			set_timer_state,
			resize_for_timer  // Add this
		])
        .setup(|app| {
            let window = app.get_webview_window("main").unwrap();
            let app_handle = app.handle().clone();
            
            // Clone window for the closure to fix borrow checker issue
            window.clone().on_window_event(move |event| {
				if let tauri::WindowEvent::Resized(size) = event {
					// Only enforce aspect ratio if width actually changed significantly
					// Don't fight height changes from timer or minor adjustments
					let state = app_handle.state::<AppState>();
					let timer_active = *state.timer_active.lock().unwrap();
        
					let width = size.width;
					let housing_height = ((width as f32 - 80.0) * 2.0).max(240.0);
					let mut target_height = 40.0 + 40.0 + housing_height;
        
					if timer_active {
						target_height += 100.0;
					}
        
					target_height = target_height.max(350.0).round();
        
					// Only correct if significantly off (prevents micro-flickers)
					// AND only if the user is dragging width (not just height)
					let height_diff = (size.height as f32 - target_height).abs();
					if height_diff > 10.0 {
						let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize {
							width: width as f64,
							height: target_height as f64,
						}));
					}
				}
			});
            
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}