import { _decorator, Component, Node, Graphics, UITransform,
         Color, Label } from 'cc';
import { RoomData, RoomType } from './DungeonRoom';

const { ccclass, property } = _decorator;

/**
 * MiniMap —— 右上角小地图
 * 显示已探索的房间格局，当前所在房间高亮
 */
@ccclass('MiniMap')
export class MiniMap extends Component {

    private _rooms:    RoomData[] = [];
    private _curRoom:  number     = 0;
    private _cellSize: number     = 14;
    private _g: Graphics | null   = null;

    // 房间类型颜色
    private readonly TYPE_COLOR: Record<RoomType, Color> = {
        start:    new Color( 60, 140, 255, 255),
        combat:   new Color(200,  50,  50, 255),
        treasure: new Color(220, 180,  30, 255),
        shop:     new Color( 50, 200, 100, 255),
        boss:     new Color(160,  40, 220, 255),
    };

    onLoad() {
        const ui = this.getComponent(UITransform) ?? this.addComponent(UITransform);
        ui.setContentSize(160, 140);
        this._g = this.getComponent(Graphics) ?? this.addComponent(Graphics);

        // 背景
        this._g.fillColor = new Color(0, 0, 0, 160);
        this._g.roundRect(-80, -70, 160, 140, 8);
        this._g.fill();
    }

    setRooms(rooms: RoomData[], currentId: number) {
        this._rooms   = rooms;
        this._curRoom = currentId;
        this._redraw();
    }

    setCurrentRoom(id: number) {
        this._curRoom = id;
        this._rooms.find(r => r.id === id)!.visited = true;
        this._redraw();
    }

    private _redraw() {
        if (!this._g) return;
        this._g.clear();

        const cs = this._cellSize;

        // 背景
        this._g.fillColor = new Color(10, 8, 20, 200);
        this._g.roundRect(-80, -70, 160, 140, 8);
        this._g.fill();

        // 标题
        // 房间格子
        this._rooms.forEach(room => {
            if (!room.visited && room.id !== this._curRoom) return;

            const x = room.gridX * (cs + 3) - 4;
            const y = room.gridY * (cs + 3) - 4;

            // 房间方块
            const isCurrent = room.id === this._curRoom;
            const color = isCurrent
                ? new Color(255, 255, 255, 255)
                : this.TYPE_COLOR[room.type];

            this._g!.fillColor = color;
            this._g!.roundRect(x, y, cs, cs, 2);
            this._g!.fill();

            // 当前房间闪烁边框
            if (isCurrent) {
                this._g!.lineWidth   = 2;
                this._g!.strokeColor = new Color(255, 230, 100, 255);
                this._g!.roundRect(x - 1, y - 1, cs + 2, cs + 2, 3);
                this._g!.stroke();
            }

            // 门洞连接线
            room.doors.forEach(door => {
                const target = this._rooms.find(r => r.id === door.toRoomId);
                if (!target || (!target.visited && target.id !== this._curRoom)) return;
                const tx = target.gridX * (cs + 3) + cs / 2 - 4;
                const ty = target.gridY * (cs + 3) + cs / 2 - 4;
                const sx = x + cs / 2;
                const sy = y + cs / 2;
                this._g!.lineWidth   = 2;
                this._g!.strokeColor = new Color(100, 100, 120, 200);
                this._g!.moveTo(sx, sy);
                this._g!.lineTo(tx, ty);
                this._g!.stroke();
            });
        });
    }
}
