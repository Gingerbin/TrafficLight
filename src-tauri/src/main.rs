#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    traffic_light::run();
}

use tauri::{Manager, Emitter, WindowEvent, State};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Code, Modifiers, Shortcut, ShortcutState};
use std::collections::HashMap;
use std::sync::Mutex;
use std::sync::Arc;

struct AppState {
    mappings: Mutex<HashMap<String, Shortcut>>,
}

#[tauri::command]
fn set_timer_visible(timer_visible: State<Arc<Mutex<bool>>>, visible: bool) {
    *timer_visible.lock().unwrap() = visible;
}

#[tauri::command]
fn minimize_window(window: tauri::WebviewWindow) {
    let _ = window.minimize();
}

#[tauri::command]
fn close_window(window: tauri::WebviewWindow) {
    let _ = window.close();
}

#[tauri::command]
fn resize_window(window: tauri::WebviewWindow, width: f64, height: f64) {
    let _ = window.set_size(tauri::Size::Logical(tauri::LogicalSize { width, height }));
}

fn parse_shortcut(s: &str) -> Option<Shortcut> {
    let parts: Vec<&str> = s.split('+').collect();
    let mut mods = Modifiers::empty();
    let mut key = None;
    
    for part in parts {
        match part.trim() {
            // Windows/Linux modifiers
            "Alt" => mods |= Modifiers::ALT,
            "Ctrl" | "Control" => mods |= Modifiers::CONTROL,
            "Shift" => mods |= Modifiers::SHIFT,
            // Mac modifiers
            "Cmd" | "Command" | "Meta" | "Super" => mods |= Modifiers::SUPER,
            "Option" => mods |= Modifiers::ALT, // Option is Alt on Mac
            // Letters
            "A" => key = Some(Code::KeyA),
            "B" => key = Some(Code::KeyB),
            "C" => key = Some(Code::KeyC),
            "D" => key = Some(Code::KeyD),
            "E" => key = Some(Code::KeyE),
            "F" => key = Some(Code::KeyF),
            "G" => key = Some(Code::KeyG),
            "H" => key = Some(Code::KeyH),
            "I" => key = Some(Code::KeyI),
            "J" => key = Some(Code::KeyJ),
            "K" => key = Some(Code::KeyK),
            "L" => key = Some(Code::KeyL),
            "M" => key = Some(Code::KeyM),
            "N" => key = Some(Code::KeyN),
            "O" => key = Some(Code::KeyO),
            "P" => key = Some(Code::KeyP),
            "Q" => key = Some(Code::KeyQ),
            "R" => key = Some(Code::KeyR),
            "S" => key = Some(Code::KeyS),
            "T" => key = Some(Code::KeyT),
            "U" => key = Some(Code::KeyU),
            "V" => key = Some(Code::KeyV),
            "W" => key = Some(Code::KeyW),
            "X" => key = Some(Code::KeyX),
            "Y" => key = Some(Code::KeyY),
            "Z" => key = Some(Code::KeyZ),
            // Numbers
            "0" => key = Some(Code::Digit0),
            "1" => key = Some(Code::Digit1),
            "2" => key = Some(Code::Digit2),
            "3" => key = Some(Code::Digit3),
            "4" => key = Some(Code::Digit4),
            "5" => key = Some(Code::Digit5),
            "6" => key = Some(Code::Digit6),
            "7" => key = Some(Code::Digit7),
            "8" => key = Some(Code::Digit8),
            "9" => key = Some(Code::Digit9),
            // Special keys
            "Space" => key = Some(Code::Space),
            "Enter" | "Return" => key = Some(Code::Enter),
            "Escape" | "Esc" => key = Some(Code::Escape),
            "Tab" => key = Some(Code::Tab),
            "Backspace" => key = Some(Code::Backspace),
            "Delete" | "Del" => key = Some(Code::Delete),
            // Function keys
            "F1" => key = Some(Code::F1),
            "F2" => key = Some(Code::F2),
            "F3" => key = Some(Code::F3),
            "F4" => key = Some(Code::F4),
            "F5" => key = Some(Code::F5),
            "F6" => key = Some(Code::F6),
            "F7" => key = Some(Code::F7),
            "F8" => key = Some(Code::F8),
            "F9" => key = Some(Code::F9),
            "F10" => key = Some(Code::F10),
            "F11" => key = Some(Code::F11),
            "F12" => key = Some(Code::F12),
            _ => {}
        }
    }
    
    key.map(|k| Shortcut::new(if mods.is_empty() { None } else { Some(mods) }, k))
}

#[tauri::command]
fn update_shortcut(
    app: tauri::AppHandle,
    state: State<AppState>,
    action: String,
    new_combo: String,
) -> Result<String, String> {
    println!("Updating shortcut: {} to {}", action, new_combo);
    
    let shortcut_mgr = app.global_shortcut();
    let new_shortcut = parse_shortcut(&new_combo)
        .ok_or_else(|| format!("Invalid shortcut format: {}", new_combo))?;
    
    let mut mappings = state.mappings.lock().unwrap();
    
    // Unregister old shortcut if exists
    if let Some(old) = mappings.get(&action) {
        println!("Unregistering old shortcut for {}", action);
        let _ = shortcut_mgr.unregister(*old);
    }
    
    let window = app.get_webview_window("main").unwrap();
    let action_clone = action.clone();
    
    // Register new shortcut
    shortcut_mgr.on_shortcut(
        new_shortcut,
        move |_app, _shortcut, event| {
            println!("Shortcut triggered: {} (state: {:?})", action_clone, event.state());
            if event.state() == ShortcutState::Pressed {
                if let Err(e) = window.emit("shortcut-triggered", action_clone.clone()) {
                    eprintln!("Failed to emit event: {}", e);
                }
            }
        }
    ).map_err(|e| format!("Failed to register: {}", e))?;
    
    mappings.insert(action, new_shortcut);
    println!("Successfully registered {}", new_combo);
    Ok(new_combo)
}

#[tauri::command]
fn initialize_shortcuts(
    app: tauri::AppHandle,
    state: State<AppState>,
    shortcuts: HashMap<String, String>,
) -> Result<(), String> {
    println!("Initializing shortcuts: {:?}", shortcuts);
    
    let shortcut_mgr = app.global_shortcut();
    let mut mappings = state.mappings.lock().unwrap();
    
    let _ = shortcut_mgr.unregister_all();
    mappings.clear();
    
    let window = app.get_webview_window("main").unwrap();
    
    for (action, combo) in shortcuts {
        if let Some(shortcut) = parse_shortcut(&combo) {
            println!("Registering {}: {}", action, combo);
            let action_clone = action.clone();
            let window_clone = window.clone();
            
            if let Err(e) = shortcut_mgr.on_shortcut(
                shortcut,
                move |_app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        let _ = window_clone.emit("shortcut-triggered", action_clone.clone());
                    }
                }
            ) {
                eprintln!("Failed to register {}: {}", action, e);
            } else {
                mappings.insert(action, shortcut);
            }
        } else {
            eprintln!("Failed to parse shortcut: {}", combo);
        }
    }
    Ok(())
}