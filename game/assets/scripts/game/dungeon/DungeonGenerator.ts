import { RoomData, RoomType, DoorDir, DoorInfo, ROOM_CONFIG } from './DungeonRoom';

/**
 * DungeonGenerator —— 随机生成一层地牢的房间布局
 *
 * 算法：从入口(0,0)开始，随机扩展 N 个房间，最后放 Boss 房
 * 返回 RoomData[] 数组，用于渲染和游戏逻辑
 */
export class DungeonGenerator {

    static generate(floorNum: number): RoomData[] {
        const totalRooms = 5 + Math.floor(floorNum * 0.5) + this._rand(0, 2);  // 5~8 个
        const rooms: RoomData[] = [];
        const grid = new Map<string, number>();   // "x,y" -> roomId

        // ── 入口房 ──
        rooms.push({ id: 0, type: 'start', gridX: 0, gridY: 0,
                     doors: [], cleared: true, visited: true });
        grid.set('0,0', 0);

        // ── 随机扩展 ──
        const dirs: DoorDir[] = ['north', 'south', 'east', 'west'];
        const offset: Record<DoorDir, [number, number]> = {
            north: [0,  1], south: [0, -1], east: [1, 0], west: [-1, 0],
        };
        const opposite: Record<DoorDir, DoorDir> = {
            north: 'south', south: 'north', east: 'west', west: 'east',
        };

        let attempts = 0;
        while (rooms.length < totalRooms - 1 && attempts < 200) {
            attempts++;
            // 随机选一个已有房间
            const src = rooms[this._rand(0, rooms.length - 1)];
            if (src.doors.length >= 3) continue;   // 最多3个门

            // 随机方向
            const dir = dirs[this._rand(0, 3)];
            const [dx, dy] = offset[dir];
            const nx = src.gridX + dx;
            const ny = src.gridY + dy;
            const key = `${nx},${ny}`;
            if (grid.has(key)) continue;

            const newId  = rooms.length;
            const rtype  = this._pickType(newId, totalRooms - 1);

            const newRoom: RoomData = {
                id: newId, type: rtype,
                gridX: nx, gridY: ny,
                doors: [{ dir: opposite[dir], toRoomId: src.id }],
                cleared: rtype === 'start',
                visited: false,
            };
            src.doors.push({ dir, toRoomId: newId });
            rooms.push(newRoom);
            grid.set(key, newId);
        }

        // ── Boss 房（接在走得最远的房间后面）──
        const bossCandidate = rooms
            .filter(r => r.type !== 'start' && r.doors.length === 1)
            .sort((a, b) =>
                (Math.abs(b.gridX) + Math.abs(b.gridY)) -
                (Math.abs(a.gridX) + Math.abs(a.gridY))
            )[0] ?? rooms[rooms.length - 1];

        // 找 bossCandidate 的可用方向
        for (const dir of dirs) {
            const [dx, dy] = offset[dir];
            const key = `${bossCandidate.gridX + dx},${bossCandidate.gridY + dy}`;
            if (!grid.has(key)) {
                const bossId = rooms.length;
                rooms.push({
                    id: bossId, type: 'boss',
                    gridX: bossCandidate.gridX + dx,
                    gridY: bossCandidate.gridY + dy,
                    doors: [{ dir: opposite[dir], toRoomId: bossCandidate.id }],
                    cleared: false, visited: false,
                });
                bossCandidate.doors.push({ dir, toRoomId: bossId });
                break;
            }
        }

        console.log(`[DungeonGen] 第${floorNum}层生成 ${rooms.length} 个房间`);
        return rooms;
    }

    private static _pickType(idx: number, maxIdx: number): RoomType {
        if (idx === maxIdx)      return 'boss';
        if (idx % 4 === 2)      return 'treasure';
        if (idx % 5 === 4)      return 'shop';
        return 'combat';
    }

    private static _rand(min: number, max: number) {
        return Math.floor(Math.random() * (max - min + 1)) + min;
    }
}
