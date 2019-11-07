export class Geometry
{
    public x: number;
    public y: number;
    public width: number;
    public height: number;

    constructor(geom: Geometry = {} as Geometry) {
        let {
            x = 0,
            y = 0,
            height = 0,
            width = 0
        } = geom;

        this.x = x;
        this.y = y;
        this.height = height;
        this.width = width;
    }
}
