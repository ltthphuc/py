# -*- coding: utf-8 -*-
"""Backend matplotlib cho Python Lab: plt.show() -> ảnh PNG gửi lên tab "Đồ họa"."""
import base64
import io

from js import _js_image
from matplotlib.backend_bases import FigureManagerBase, _Backend
from matplotlib.backends.backend_agg import FigureCanvasAgg


class FigureManager(FigureManagerBase):
    def show(self):
        buf = io.BytesIO()
        self.canvas.figure.savefig(buf, format='png', dpi=100, facecolor='white')
        _js_image(base64.b64encode(buf.getvalue()).decode('ascii'))


class FigureCanvas(FigureCanvasAgg):
    manager_class = FigureManager


@_Backend.export
class _BackendLab(_Backend):
    FigureCanvas = FigureCanvas
    FigureManager = FigureManager
    mainloop = None
