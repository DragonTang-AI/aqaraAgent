bl_info = {
    "name": "Aqara MCP Bridge",
    "author": "Aqara",
    "version": (1, 0, 0),
    "blender": (3, 0, 0),
    "location": "View3D > Sidebar > Aqara",
    "description": "为 Aqara 桌面端提供本地桥接服务（MCP），用于读取场景与执行脚本。",
    "category": "Development",
}

import bpy
import json
import queue
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = 9887
_QUEUE = queue.Queue()
_SERVER = None
_THREAD = None


def _run_code(code):
    """在主线程执行用户代码。约定：若脚本内给 result 赋值，则返回它。"""
    ns = {"bpy": bpy, "__name__": "__aqara_bridge__"}
    try:
        exec(code, ns)
        return {"ok": True, "result": str(ns.get("result", ""))}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def _scene_summary():
    sc = bpy.context.scene
    objs = [{"name": o.name, "type": o.type} for o in sc.objects]
    return {
        "ok": True,
        "blender": bpy.app.version_string,
        "scene": sc.name,
        "objects": len(objs),
        "items": objs[:200],
        "camera": sc.camera.name if sc.camera else None,
    }


def _process_queue():
    """由 bpy.app.timers 驱动，在主线程安全地执行排队的任务。"""
    try:
        while True:
            job = _QUEUE.get_nowait()
            job["cb"](_run_code(job["code"]))
    except queue.Empty:
        pass
    return 0.1


class _Handler(BaseHTTPRequestHandler):
    def _send(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path == "/ping":
            self._send({"ok": True, "blender": bpy.app.version_string})
        elif self.path == "/scene":
            ev = threading.Event()
            box = {}

            def cb(r):
                box.update(r)
                ev.set()

            _QUEUE.put({"code": "result = None", "cb": lambda r: (box.update(_scene_summary()), ev.set())})
            ev.wait(3)
            self._send(box or {"ok": False, "error": "timeout"})
        else:
            self._send({"ok": False, "error": "not found"}, 404)

    def do_POST(self):
        ln = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(ln).decode("utf-8") if ln else "{}"
        try:
            req = json.loads(raw or "{}")
        except Exception:
            req = {}
        if self.path == "/exec":
            code = str(req.get("code", ""))
            ev = threading.Event()
            box = {}

            def cb(r):
                box.update(r)
                ev.set()

            _QUEUE.put({"code": code, "cb": cb})
            ev.wait(10)
            self._send(box or {"ok": False, "error": "timeout"})
        else:
            self._send({"ok": False, "error": "not found"}, 404)

    def log_message(self, *args):
        pass


def start_server(port=PORT):
    global _SERVER, _THREAD
    if _SERVER is not None:
        return
    try:
        _SERVER = HTTPServer(("127.0.0.1", port), _Handler)
    except Exception as e:
        print("[Aqara] 启动桥接失败：", e)
        _SERVER = None
        return
    _THREAD = threading.Thread(target=_SERVER.serve_forever, daemon=True)
    _THREAD.start()
    try:
        bpy.app.timers.register(_process_queue, persistent=True)
    except Exception:
        pass
    print("[Aqara] MCP 桥接已启动：http://127.0.0.1:%d" % port)


def stop_server():
    global _SERVER
    try:
        bpy.app.timers.unregister(_process_queue)
    except Exception:
        pass
    if _SERVER is not None:
        try:
            _SERVER.shutdown()
        except Exception:
            pass
        _SERVER = None


class AQARA_OT_start(bpy.types.Operator):
    bl_idname = "aqara.start_bridge"
    bl_label = "Start MCP Server"

    def execute(self, context):
        start_server()
        self.report({"INFO"}, "Aqara MCP 已启动 127.0.0.1:%d" % PORT)
        return {"FINISHED"}


class AQARA_OT_stop(bpy.types.Operator):
    bl_idname = "aqara.stop_bridge"
    bl_label = "Stop MCP Server"

    def execute(self, context):
        stop_server()
        self.report({"INFO"}, "Aqara MCP 已停止")
        return {"FINISHED"}


class AQARA_PT_panel(bpy.types.Panel):
    bl_label = "Aqara MCP"
    bl_space_type = "VIEW_3D"
    bl_region_type = "UI"
    bl_category = "Aqara"

    def draw(self, context):
        col = self.layout.column()
        col.label(text="桥接端口：127.0.0.1:%d" % PORT)
        col.operator("aqara.start_bridge")
        col.operator("aqara.stop_bridge")


def register():
    bpy.utils.register_class(AQARA_OT_start)
    bpy.utils.register_class(AQARA_OT_stop)
    bpy.utils.register_class(AQARA_PT_panel)
    # 插件启用即自动启动桥接
    start_server()


def unregister():
    stop_server()
    bpy.utils.unregister_class(AQARA_PT_panel)
    bpy.utils.unregister_class(AQARA_OT_stop)
    bpy.utils.unregister_class(AQARA_OT_start)


if __name__ == "__main__":
    register()
