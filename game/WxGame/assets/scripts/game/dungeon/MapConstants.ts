/**
 * MapConstants —— 地图全局常量
 * 独立文件，避免循环 import
 */
export const MAP_COLS   = 80;
export const MAP_ROWS   = 40;
export const MAP_TILE   = 48;
export const MAP_W      = MAP_COLS * MAP_TILE;   // 3840
export const MAP_H      = MAP_ROWS * MAP_TILE;   // 1920
export const MAP_HALF_W = MAP_W / 2;             // 1920
export const MAP_HALF_H = MAP_H / 2;             //  960
