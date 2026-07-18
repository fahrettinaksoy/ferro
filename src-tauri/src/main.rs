// Windows'ta release build'de konsol penceresi açılmasın.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    ferro_lib::run()
}
