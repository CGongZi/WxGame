import { RoomData, RoomType, Direction, FloorData, EnemySpawnEntry } from '../../core/types';
import { GameConfig } from '../../core/GameConfig';

/**
 * 地牢生成器
 * 算法：随机网格扩展（保证所有房间连通）
 */
export class DungeonGenerator {

    /** 生成一层地牢 */
    static generate(floorNumber: number): FloorData {
        const roomCount = GameConfig.DUNGEON_ROOMS_MIN
            + Math.floor(Math.random() * (GameConfig.DUNGEON_ROOMS_MAX - GameConfig.DUNGEON_ROOMS_MIN + 1));

        const rooms = this._generateRooms(floorNumber, roomCount);
        const startRoom = rooms.find(r => r.type === 'start')!;
        const bossRoom = rooms.find(r => r.type === 'boss')!;

        return {
            floorNumber,
            rooms,
            startRoomId: startRoom.id,
            bossRoomId: bossRoom.id,
            currentRoomId: startRoom.id,
        };
    }

    private static _generateRooms(floor: number, count: number): RoomData[] {
        const grid = new Map<string, RoomData>();
        const queue: [number, number][] = [[0, 0]];
        const dirs: [number, number, Direction, Direction][] = [
            [0, 1, 'north', 'south'],
            [0, -1, 'south', 'north'],
            [1, 0, 'east', 'west'],
            [-1, 0, 'west', 'east'],
        ];

        let roomIndex = 0;

        while (queue.length > 0 && grid.size < count) {
            const [gx, gy] = queue.shift()!;
            const key = `${gx},${gy}`;
            if (grid.has(key)) continue;

            // 决定房间类型
            const type = this._decideRoomType(grid.size, count, floor);
            const room = this._createRoom(roomIndex++, type, gx, gy, floor);
            grid.set(key, room);

            // 随机打乱方向，扩展邻居
            const shuffled = this._shuffle([...dirs]);
            for (const [dx, dy] of shuffled) {
                const nx = gx + dx;
                const ny = gy + dy;
                const nk = `${nx},${ny}`;
                if (!grid.has(nk) && grid.size < count) {
                    queue.push([nx, ny]);
                }
            }
        }

        // 计算出口方向
        const rooms = Array.from(grid.values());
        for (const room of rooms) {
            const exits: Direction[] = [];
            for (const [dx, dy, dir] of dirs) {
                const nk = `${room.gridX + dx},${room.gridY + dy}`;
                if (grid.has(nk)) exits.push(dir);
            }
            room.exits = exits;
        }

        // 连接相邻房间（确保 Boss 房在末端）
        const bossRoom = rooms.find(r => r.type === 'boss')!;
        if (bossRoom && bossRoom.exits.length > 1) {
            // Boss 房只留一个出口
            bossRoom.exits = [bossRoom.exits[0]];
        }

        return rooms;
    }

    private static _decideRoomType(current: number, total: number, _floor: number): RoomType {
        if (current === 0) return 'start';
        if (current === total - 1) return 'boss';
        // 约 15% 概率宝箱房，10% 商店
        const r = Math.random();
        if (r < 0.10 && current > 1) return 'shop';
        if (r < 0.25 && current > 1) return 'treasure';
        return 'combat';
    }

    private static _createRoom(
        index: number,
        type: RoomType,
        gx: number,
        gy: number,
        floor: number,
    ): RoomData {
        const templatePool: Record<RoomType, string[]> = {
            start: ['room_start_01'],
            combat: ['room_combat_01', 'room_combat_02', 'room_combat_03'],
            treasure: ['room_treasure_01', 'room_treasure_02'],
            shop: ['room_shop_01'],
            boss: ['room_boss_01'],
        };
        const templates = templatePool[type];
        const templateId = templates[Math.floor(Math.random() * templates.length)];

        return {
            id: `room_${index}`,
            type,
            templateId,
            exits: [],
            enemies: type === 'combat' ? this._generateEnemies(floor) : [],
            isCleared: type === 'start',
            gridX: gx,
            gridY: gy,
        };
    }

    private static _generateEnemies(floor: number): EnemySpawnEntry[] {
        // 随楼层增加敌人数量和难度
        const baseCount = 2 + floor;
        const count = baseCount + Math.floor(Math.random() * 3);

        const enemyPool = floor <= 2
            ? ['slime_green', 'bat_gray']
            : ['slime_red', 'skeleton', 'archer_goblin'];

        return Array.from({ length: count }, (_, i) => ({
            enemyId: enemyPool[Math.floor(Math.random() * enemyPool.length)],
            count: 1,
            spawnDelay: i * 0.3,
        }));
    }

    private static _shuffle<T>(arr: T[]): T[] {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}
