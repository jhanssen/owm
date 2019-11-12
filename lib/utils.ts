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

interface StrutData
{
    left: number;
    right: number;
    top: number;
    bottom: number;
    left_start_y?: number;
    left_end_y?: number;
    right_start_y?: number;
    right_end_y?: number;
    top_start_x?: number;
    top_end_x?: number;
    bottom_start_x?: number;
    bottom_end_x?: number;
}

export class Strut
{
    public left: number;
    public right: number;
    public top: number;
    public bottom: number;
    public left_start_y: number;
    public left_end_y: number;
    public right_start_y: number;
    public right_end_y: number;
    public top_start_x: number;
    public top_end_x: number;
    public bottom_start_x: number;
    public bottom_end_x: number;

    constructor(strut: StrutData = {} as StrutData) {
        let {
            left = 0,
            right = 0,
            top = 0,
            bottom = 0,
            left_start_y = 0,
            left_end_y = 0,
            right_start_y = 0,
            right_end_y = 0,
            top_start_x = 0,
            top_end_x = 0,
            bottom_start_x = 0,
            bottom_end_x = 0
        } = strut;

        this.left = left;
        this.right = right;
        this.top = top;
        this.bottom = bottom;
        this.left_start_y = left_start_y;
        this.left_end_y = left_end_y;
        this.right_start_y = right_start_y;
        this.right_end_y = right_end_y;
        this.top_start_x = top_start_x;
        this.top_end_x = top_end_x;
        this.bottom_start_x = bottom_start_x;
        this.bottom_end_x = bottom_end_x;
    }

    unite(strut: Strut) {
        if (strut.left > this.left)
            this.left = strut.left;
        if (strut.right > this.right)
            this.right = strut.right;
        if (strut.top > this.top)
            this.top = strut.top;
        if (strut.bottom > this.bottom)
            this.bottom = strut.bottom;

        if (strut.left_start_y < this.left_start_y)
            this.left_start_y = strut.left_start_y;
        if (strut.left_end_y > this.left_end_y)
            this.left_end_y = strut.left_end_y;

        if (strut.right_start_y < this.right_start_y)
            this.right_start_y = strut.right_start_y;
        if (strut.right_end_y > this.right_end_y)
            this.right_end_y = strut.right_end_y;

        if (strut.top_start_x < this.top_start_x)
            this.top_start_x = strut.top_start_x;
        if (strut.top_end_x > this.top_end_x)
            this.top_end_x = strut.top_end_x;

        if (strut.bottom_start_x < this.bottom_start_x)
            this.bottom_start_x = strut.bottom_start_x;
        if (strut.bottom_end_x > this.bottom_end_x)
            this.bottom_end_x = strut.bottom_end_x;
    }

    fillPartial(partial: { x: number, y: number, width: number, height: number }) {
        if (this.left > 0) {
            this.left_start_y = 0;
            this.left_end_y = partial.y + partial.height;
        }
        if (this.right > 0) {
            this.right_start_y = 0;
            this.right_end_y = partial.y + partial.height;
        }
        if (this.top > 0) {
            this.top_start_x = 0;
            this.top_end_x = partial.x + partial.width;
        }
        if (this.bottom > 0) {
            this.bottom_start_x = 0;
            this.bottom_end_x = partial.x + partial.height;
        }
    }

    public static hasStrut(strut: { left: number, right: number, top: number, bottom: number }) {
        return strut.left > 0 || strut.right > 0 || strut.top > 0 || strut.bottom > 0;
    }
}
