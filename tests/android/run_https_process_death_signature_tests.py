#!/usr/bin/env python3
"""Synthetic regressions for the process-death labels; no real lab output."""
from https_process_death_signature_v1 import diagnose

KILL = [
    "E/chromium( 6033): [ERROR:aw_browser_terminator.cc(156)] Renderer process (6077) crash detected (code -1).",
    "E/chromium( 6033): [ERROR:aw_browser_terminator.cc(112)] Render process (6077) kill (OOM or update) wasn't handed by all associated webviews, killing application.",
    "I/ActivityManager(  548): Process br.com.tata.entregas.debug (pid 6033) has died: fg  TOP ",
]
CRASH = [
    "E/chromium( 6190): [ERROR:aw_browser_terminator.cc(156)] Renderer process (6232) crash detected (code 11).",
    "F/chromium( 6190): [FATAL:crashpad_client_linux.cc(732)] Render process (6232)'s crash wasn't handled by all associated  webviews, triggering application crash.",
]
LMKD = [
    "I/lowmemorykiller(  201): Kill 'com.android.vending' (3100), uid 10120, oom_score_adj 900 to free 51234kB rss",
    "I/lowmemorykiller(  201): Kill 'com.google.android.webview:sandboxed_process0:x' (3200), uid 99001, oom_score_adj 0 to free 9kB",
    "I/lowmemorykiller(  201): Kill 'br.com.tata.entregas.debug' (3300), uid 10194, oom_score_adj 0 to free 9kB",
]

def check():
    assert diagnose(KILL) == ([
        "LAB_HTTPS_RENDERER_GONE_DETECTED",
        "LAB_HTTPS_RENDERER_KILL_UNHANDLED_APP_SELF_KILLED",
        "LAB_HTTPS_APP_PROCESS_DIED",
    ], 0)
    assert diagnose(CRASH) == ([
        "LAB_HTTPS_RENDERER_GONE_DETECTED",
        "LAB_HTTPS_RENDERER_CRASH_UNHANDLED_APP_ABORTED",
    ], 0)
    assert diagnose(LMKD) == ([
        "LAB_HTTPS_LMKD_KILLED_RENDERER", "LAB_HTTPS_LMKD_KILLED_APP",
    ], 3)
    # Renderer que morre e e tratado: so a deteccao, sem morte do app.
    assert diagnose(KILL[:1]) == (["LAB_HTTPS_RENDERER_GONE_DETECTED"], 0)
    # Nada do conteudo da linha atravessa: nem pid, nem texto livre.
    noisy = ["I/ActivityManager( 1): Process br.com.tata.entregas.debug (pid 4242) has died CUSTOMER 11999998888 token=abc"]
    labels, count = diagnose(noisy)
    assert labels == ["LAB_HTTPS_APP_PROCESS_DIED"] and count == 0
    assert "4242" not in str(labels) and "11999998888" not in str(labels)
    assert diagnose(["W/Other: br.com.tata.entregas rendered fine", ""]) == ([], 0)
    print("ANDROID_HTTPS_PROCESS_DEATH_LABELS_LAB_PASS 6/6")

check()
