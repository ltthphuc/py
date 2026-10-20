# -*- coding: utf-8 -*-
"""Mô-đun turtle thu gọn cho Python Lab: tính đường đi bằng Python, vẽ lên canvas của trình duyệt.
API giống thư viện turtle chuẩn (phần thường dùng ở THCS)."""
import json
import math
import sys

import builtins
from js import _js_turtle  # hàm JS do worker cung cấp

__all__ = [
    'Turtle', 'Screen', 'Pen', 'RawTurtle', 'Vec2D', 'done', 'mainloop', 'exitonclick', 'bye', 'forward', 'fd', 'backward', 'bk', 'back',
    'left', 'lt', 'right', 'rt', 'goto', 'setpos', 'setposition', 'setx', 'sety', 'setheading', 'seth', 'home', 'penup', 'pu', 'up',
    'pendown', 'pd', 'down', 'pensize', 'width', 'pencolor', 'fillcolor', 'color', 'begin_fill', 'end_fill', 'filling', 'circle', 'dot',
    'write', 'speed', 'hideturtle', 'ht', 'showturtle', 'st', 'isvisible', 'clear', 'reset', 'clearscreen', 'resetscreen', 'bgcolor',
    'title', 'screensize', 'setup', 'tracer', 'update', 'delay', 'shape', 'shapesize', 'stamp', 'position', 'pos', 'xcor', 'ycor',
    'heading', 'distance', 'towards', 'isdown', 'degrees', 'radians', 'colormode', 'onclick', 'onkey', 'onkeypress', 'onkeyrelease',
    'onscreenclick', 'listen', 'ontimer', 'textinput', 'numinput', 'undo', 'getscreen', 'window_width', 'window_height',
    'setworldcoordinates', 'mode', 'Terminator', 'write_docstringdict', 'bgpic', 'getcanvas', 'turtles', 'hideturtle', 'ScrolledCanvas',
]

_ops = []
_colormode = 1.0


class Terminator(Exception):
    pass


class Vec2D(tuple):
    def __new__(cls, x, y):
        return tuple.__new__(cls, (x, y))

    def __add__(self, o):
        return Vec2D(self[0] + o[0], self[1] + o[1])

    def __sub__(self, o):
        return Vec2D(self[0] - o[0], self[1] - o[1])

    def __mul__(self, o):
        if isinstance(o, (int, float)):
            return Vec2D(self[0] * o, self[1] * o)
        return self[0] * o[0] + self[1] * o[1]

    def __abs__(self):
        return math.hypot(self[0], self[1])

    def __repr__(self):
        return '(%.2f,%.2f)' % self


def _emit(op):
    _ops.append(op)
    if len(_ops) >= 400:
        _flush()


def _flush():
    global _ops
    data, _ops = _ops, []
    if not data and not _turtles:
        return
    for t in _turtles:
        data.append({'o': 'turtle', 'id': id(t), 'x': t._x, 'y': t._y, 'h': t._h, 'show': t._visible, 'c': t._pc})
    _js_turtle(json.dumps(data))


def _col(c, *rest):
    """Đổi màu về chuỗi CSS."""
    if rest:
        c = (c,) + rest
    if isinstance(c, str):
        c = c.strip()
        return c if c else 'black'
    if isinstance(c, (tuple, list)) and len(c) == 3:
        r, g, b = c
        k = 255 if _colormode == 255 else 1.0
        f = lambda v: max(0, min(255, int(round(v * 255 / k))))
        return '#%02x%02x%02x' % (f(r), f(g), f(b))
    raise TypeError('bad color arguments: %r' % (c,))


class Screen:
    _inst = None

    def __new__(cls):
        if cls._inst is None:
            cls._inst = object.__new__(cls)
            cls._inst._bg = 'white'
            cls._inst._w, cls._inst._h = 800, 600
        return cls._inst

    def bgcolor(self, *c):
        if not c:
            return self._bg
        self._bg = _col(*c)
        _emit({'o': 'bg', 'c': self._bg})

    def title(self, t):
        pass

    def screensize(self, w=None, h=None, bg=None):
        if w is None:
            return (self._w, self._h)
        self._w, self._h = w, h or w
        if bg:
            self.bgcolor(bg)

    def setup(self, width=0.5, height=0.75, startx=None, starty=None):
        pass

    def tracer(self, n=None, delay=None):
        return 1

    def update(self):
        for t in _turtles:
            t._draw_cursor()
        _flush()

    def delay(self, d=None):
        return 10

    def clear(self):
        _emit({'o': 'clear'})

    reset = clear

    def mainloop(self):
        self.update()

    done = exitonclick = bye = mainloop

    def listen(self, *a, **k):
        pass

    def onclick(self, *a, **k):
        pass

    def onkey(self, *a, **k):
        pass

    onkeypress = onkeyrelease = onscreenclick = ontimer = onclick

    def textinput(self, title, prompt):
        return builtins.input(str(prompt) + ' ')

    def numinput(self, title, prompt, default=None, minval=None, maxval=None):
        try:
            return float(builtins.input(str(prompt) + ' '))
        except ValueError:
            return default

    def colormode(self, m=None):
        global _colormode
        if m is None:
            return _colormode
        _colormode = 255 if m == 255 else 1.0

    def window_width(self):
        return self._w

    def window_height(self):
        return self._h

    def setworldcoordinates(self, *a):
        pass

    def mode(self, m=None):
        return 'standard'

    def bgpic(self, *a):
        pass

    def getcanvas(self):
        return None

    def getscreen(self):
        return self


_turtles = []


class RawTurtle:
    def __init__(self, *args, **kwargs):
        Screen()
        self._x = self._y = 0.0
        self._h = 0.0          # độ, 0 = hướng Đông
        self._pen = True
        self._pc, self._fc = 'black', 'black'
        self._w = 1
        self._visible = True
        self._fill = None
        self._unit = 360.0
        self._speed = 3
        self._hist = []
        _turtles.append(self)
        self._draw_cursor()

    # ---------- góc ----------
    def degrees(self, fullcircle=360.0):
        self._unit = fullcircle

    def radians(self):
        self._unit = 2 * math.pi

    def _to_deg(self, a):
        return a * 360.0 / self._unit

    # ---------- di chuyển ----------
    def _moveto(self, x, y):
        if self._pen:
            _emit({'o': 'line', 'x1': self._x, 'y1': self._y, 'x2': x, 'y2': y, 'c': self._pc, 'w': self._w})
        self._x, self._y = float(x), float(y)
        if self._fill is not None:
            self._fill.append((self._x, self._y))

    def forward(self, d):
        r = math.radians(self._h)
        self._moveto(self._x + d * math.cos(r), self._y + d * math.sin(r))
        self._draw_cursor()

    fd = forward

    def backward(self, d):
        self.forward(-d)

    bk = back = backward

    def left(self, a):
        self._h = (self._h + self._to_deg(a)) % 360.0
        self._draw_cursor()

    lt = left

    def right(self, a):
        self.left(-a)

    rt = right

    def goto(self, x, y=None):
        if y is None:
            x, y = x
        self._moveto(x, y)
        self._draw_cursor()

    setpos = setposition = goto

    def setx(self, x):
        self.goto(x, self._y)

    def sety(self, y):
        self.goto(self._x, y)

    def setheading(self, a):
        self._h = self._to_deg(a) % 360.0
        self._draw_cursor()

    seth = setheading

    def home(self):
        self.goto(0, 0)
        self.setheading(0)

    def circle(self, radius, extent=None, steps=None):
        if extent is None:
            extent = self._unit
        frac = abs(extent) / self._unit
        if steps is None:
            steps = 1 + int(min(11 + abs(radius) / 6.0, 59.0) * frac)
        w = 1.0 * extent / steps
        w2 = 0.5 * w
        l = 2.0 * radius * math.sin(math.radians(self._to_deg(w2)))
        if radius < 0:
            l, w, w2 = -l, -w, -w2
        self.left(w2)
        for _ in range(steps):
            self.forward(l)
            self.left(w)
        self.right(w2)

    def dot(self, size=None, *color):
        if size is None:
            size = max(self._w + 4, self._w * 2)
        c = _col(*color) if color else self._pc
        _emit({'o': 'dot', 'x': self._x, 'y': self._y, 'r': size / 2.0, 'c': c})

    def stamp(self):
        _emit({'o': 'dot', 'x': self._x, 'y': self._y, 'r': 6, 'c': self._pc})
        return 0

    def write(self, arg, move=False, align='left', font=('Arial', 8, 'normal')):
        _emit({'o': 'text', 'x': self._x, 'y': self._y, 's': str(arg), 'c': self._pc, 'align': align,
               'font': [str(font[0]), int(font[1]), str(font[2]) if len(font) > 2 else 'normal']})

    def undo(self):
        pass

    # ---------- bút ----------
    def penup(self):
        self._pen = False

    pu = up = penup

    def pendown(self):
        self._pen = True

    pd = down = pendown

    def isdown(self):
        return self._pen

    def pensize(self, w=None):
        if w is None:
            return self._w
        self._w = w

    width = pensize

    def pencolor(self, *c):
        if not c:
            return self._pc
        self._pc = _col(*c)
        self._draw_cursor()

    def fillcolor(self, *c):
        if not c:
            return self._fc
        self._fc = _col(*c)

    def color(self, *c):
        if not c:
            return self._pc, self._fc
        if len(c) == 2:
            self._pc, self._fc = _col(c[0]), _col(c[1])
        else:
            self._pc = self._fc = _col(*c)
        self._draw_cursor()

    def begin_fill(self):
        self._fill = [(self._x, self._y)]

    def end_fill(self):
        if self._fill and len(self._fill) > 2:
            _emit({'o': 'fill', 'pts': self._fill, 'c': self._fc})
        self._fill = None

    def filling(self):
        return self._fill is not None

    def speed(self, s=None):
        if s is None:
            return self._speed
        self._speed = s

    def shape(self, s=None):
        return 'classic'

    def shapesize(self, *a, **k):
        pass

    turtlesize = shapesize

    def hideturtle(self):
        self._visible = False
        self._draw_cursor()

    ht = hideturtle

    def showturtle(self):
        self._visible = True
        self._draw_cursor()

    st = showturtle

    def isvisible(self):
        return self._visible

    # ---------- truy vấn ----------
    def position(self):
        return Vec2D(self._x, self._y)

    pos = position

    def xcor(self):
        return self._x

    def ycor(self):
        return self._y

    def heading(self):
        return self._h * self._unit / 360.0

    def distance(self, x, y=None):
        if y is None:
            x, y = x
        return math.hypot(x - self._x, y - self._y)

    def towards(self, x, y=None):
        if y is None:
            x, y = x
        a = math.degrees(math.atan2(y - self._y, x - self._x)) % 360.0
        return a * self._unit / 360.0

    def clear(self):
        _emit({'o': 'clear'})

    def reset(self):
        self.clear()
        self._x = self._y = 0.0
        self._h = 0.0
        self._pen = True
        self._pc = self._fc = 'black'
        self._w = 1

    def getscreen(self):
        return Screen()

    def onclick(self, *a, **k):
        pass

    onrelease = ondrag = onclick

    def _draw_cursor(self):
        pass  # con rùa được gửi kèm mỗi lần _flush()


class Turtle(RawTurtle):
    pass


Pen = Turtle

# ----------------- API dạng hàm -----------------
_t = None


def _turtle():
    global _t
    if _t is None:
        _t = Turtle()
    return _t


def _wrap(name):
    def f(*a, **k):
        return getattr(_turtle(), name)(*a, **k)
    f.__name__ = name
    return f


for _n in ('forward fd backward bk back left lt right rt goto setpos setposition setx sety setheading seth home circle dot stamp write undo '
           'penup pu up pendown pd down isdown pensize width pencolor fillcolor color begin_fill end_fill filling speed shape shapesize '
           'hideturtle ht showturtle st isvisible position pos xcor ycor heading distance towards degrees radians clear reset').split():
    globals()[_n] = _wrap(_n)


def _swrap(name):
    def f(*a, **k):
        return getattr(Screen(), name)(*a, **k)
    f.__name__ = name
    return f


for _n in ('bgcolor title screensize setup tracer update delay mainloop done exitonclick bye listen onkey onkeypress onkeyrelease '
           'onscreenclick ontimer textinput numinput colormode window_width window_height setworldcoordinates mode bgpic getcanvas').split():
    globals()[_n] = _swrap(_n)

onclick = _wrap('onclick')
clearscreen = resetscreen = _swrap('clear')


def getscreen():
    return Screen()


def turtles():
    return list(_turtles)


def write_docstringdict(*a):
    pass


class ScrolledCanvas:
    pass


def mainloop():
    Screen().update()


done = mainloop
exitonclick = bye = mainloop
