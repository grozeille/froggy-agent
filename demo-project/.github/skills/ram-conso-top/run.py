#!/usr/bin/env python3
"""RAM libre/totale + top consommateurs mémoire, résumé en français."""
import argparse
import os
import platform
import subprocess
import sys


def fmt(kb, unite):
    if kb is None:
        return "inconnu"
    if unite == "mo":
        return f"{kb / 1024:.1f} Mo"
    if unite == "go":
        return f"{kb / 1024 / 1024:.2f} Go"
    if kb >= 1024 * 1024:
        return f"{kb / 1024 / 1024:.2f} Go"
    if kb >= 1024:
        return f"{kb / 1024:.1f} Mo"
    return f"{kb:.0f} Ko"


def mem_linux():
    info = {}
    with open("/proc/meminfo", encoding="utf-8") as f:
        for line in f:
            p = line.split()
            if len(p) >= 2 and p[0].endswith(":"):
                try:
                    info[p[0][:-1]] = int(p[1])
                except ValueError:
                    pass
    total = info.get("MemTotal")
    if total is None:
        return None
    libre = info.get("MemFree", 0)
    dispo = info.get("MemAvailable", libre)
    utilisee = total - dispo
    return {"total": total, "libre": libre, "dispo": dispo,
            "utilisee": utilisee, "pct": utilisee * 100 / total if total else 0}


def mem_windows():
    try:
        import ctypes

        class MS(ctypes.Structure):
            _fields_ = [("dwLength", ctypes.c_ulong),
                        ("dwMemoryLoad", ctypes.c_ulong),
                        ("ullTotalPhys", ctypes.c_ulonglong),
                        ("ullAvailPhys", ctypes.c_ulonglong),
                        ("ullTotalPageFile", ctypes.c_ulonglong),
                        ("ullAvailPageFile", ctypes.c_ulonglong),
                        ("ullTotalVirtual", ctypes.c_ulonglong),
                        ("ullAvailVirtual", ctypes.c_ulonglong),
                        ("ullAvailExtendedVirtual", ctypes.c_ulonglong)]
        st = MS()
        st.dwLength = ctypes.sizeof(MS)
        if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(st)):
            return None
        total = st.ullTotalPhys // 1024
        dispo = st.ullAvailPhys // 1024
        return {"total": total, "libre": dispo, "dispo": dispo,
                "utilisee": total - dispo, "pct": st.dwMemoryLoad}
    except Exception:
        return None


def mem_macos():
    try:
        total_b = int(subprocess.run(["sysctl", "-n", "hw.memsize"],
                                     capture_output=True, text=True, timeout=10).stdout.strip())
        total = total_b // 1024
        out = subprocess.run(["vm_stat"], capture_output=True, text=True, timeout=10).stdout
        pages = {}
        page_size = 4096
        for line in out.splitlines():
            if "page size" in line:
                try:
                    page_size = int("".join(c for c in line if c.isdigit()))
                except ValueError:
                    pass
            if ":" in line:
                k, v = line.split(":", 1)
                pages[k.strip()] = int("".join(c for c in v if c.isdigit()) or 0)
        libre = (pages.get("Pages free", 0) + pages.get("Pages inactive", 0)) * page_size // 1024
        dispo = libre
        return {"total": total, "libre": libre, "dispo": dispo,
                "utilisee": total - dispo, "pct": (total - dispo) * 100 / total}
    except Exception:
        return None


def get_mem():
    syst = platform.system()
    if syst == "Windows":
        return mem_windows()
    if syst == "Darwin":
        m = mem_macos()
        if m:
            return m
    if os.path.exists("/proc/meminfo"):
        try:
            return mem_linux()
        except OSError:
            pass
    return None


def procs_linux(total_kb, n):
    procs = []
    for pid in os.listdir("/proc"):
        if not pid.isdigit():
            continue
        base = os.path.join("/proc", pid)
        try:
            with open(os.path.join(base, "comm"), encoding="utf-8", errors="replace") as f:
                name = f.read().strip() or pid
            rss = None
            with open(os.path.join(base, "status"), encoding="utf-8", errors="replace") as f:
                for line in f:
                    if line.startswith("VmRSS:"):
                        rss = int(line.split()[1])
                        break
            if rss is None:
                with open(os.path.join(base, "statm"), encoding="utf-8") as f:
                    rss = int(f.read().split()[1]) * 4
            if rss <= 0:
                continue
            procs.append({"pid": int(pid), "nom": name, "rss": rss})
        except (OSError, ValueError, IndexError):
            continue
    procs.sort(key=lambda p: p["rss"], reverse=True)
    top = procs[:n]
    for p in top:
        p["pct"] = p["rss"] * 100 / total_kb if total_kb else 0
    return top


def procs_ps(total_kb, n):
    try:
        r = subprocess.run(["ps", "-eo", "pid,comm,rss"], capture_output=True,
                           text=True, timeout=15)
        if r.returncode != 0:
            return []
        procs = []
        for line in r.stdout.splitlines()[1:]:
            p = line.split(None, 2)
            if len(p) != 3:
                continue
            try:
                pid, comm, rss = int(p[0]), p[1], int(p[2])
            except ValueError:
                continue
            if rss <= 0:
                continue
            procs.append({"pid": pid, "nom": comm, "rss": rss,
                          "pct": rss * 100 / total_kb if total_kb else 0})
        procs.sort(key=lambda p: p["rss"], reverse=True)
        return procs[:n]
    except Exception:
        return []


def procs_windows(total_kb, n):
    try:
        import ctypes
        import ctypes.wintypes
        psapi = ctypes.windll.psapi
        k32 = ctypes.windll.kernel32
        pids = (ctypes.c_ulong * 2048)()
        needed = ctypes.c_ulong()
        if not psapi.EnumProcesses(pids, ctypes.sizeof(pids), ctypes.byref(needed)):
            return []
        count = needed.value // ctypes.sizeof(ctypes.c_ulong)
        procs = []
        for i in range(count):
            pid = pids[i]
            h = k32.OpenProcess(0x0400 | 0x0010, False, pid)
            if not h:
                continue
            try:
                class PMC(ctypes.Structure):
                    _fields_ = [("cb", ctypes.c_ulong),
                                ("PageFaultCount", ctypes.c_ulong),
                                ("PeakWorkingSetSize", ctypes.c_size_t),
                                ("WorkingSetSize", ctypes.c_size_t),
                                ("QuotaPeakPagedPoolUsage", ctypes.c_size_t),
                                ("QuotaPagedPoolUsage", ctypes.c_size_t),
                                ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t),
                                ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                                ("PagefileUsage", ctypes.c_size_t),
                                ("PeakPagefileUsage", ctypes.c_size_t)]
                pmc = PMC()
                pmc.cb = ctypes.sizeof(PMC)
                if not psapi.GetProcessMemoryInfo(h, ctypes.byref(pmc), pmc.cb):
                    continue
                buf = ctypes.create_unicode_buffer(260)
                name = f"PID {pid}"
                if psapi.GetModuleBaseNameW(h, None, buf, 260):
                    name = buf.value or name
                rss = pmc.WorkingSetSize // 1024
                procs.append({"pid": pid, "nom": name, "rss": rss,
                              "pct": rss * 100 / total_kb if total_kb else 0})
            finally:
                k32.CloseHandle(h)
        procs.sort(key=lambda p: p["rss"], reverse=True)
        return procs[:n]
    except Exception:
        return []


def get_procs(total_kb, n):
    syst = platform.system()
    if syst == "Windows":
        ps = procs_windows(total_kb, n)
        return ps if ps else []
    if os.path.isdir("/proc"):
        try:
            return procs_linux(total_kb, n)
        except OSError:
            pass
    return procs_ps(total_kb, n)


def parse_args(argv):
    ap = argparse.ArgumentParser(
        description="Affiche la RAM totale/libre et le top des processus consommateurs.")
    ap.add_argument("--top", type=int, default=5, help="Nombre de processus à lister (défaut : 5).")
    ap.add_argument("--unite", choices=["auto", "mo", "go"], default="auto",
                    help="Unité d'affichage (défaut : auto).")
    ap.add_argument("--output", default=None,
                    help="Fichier relatif au workspace où écrire le rapport (ex. data/rapport-ram.txt).")
    a = ap.parse_args(argv)
    if not 1 <= a.top <= 50:
        ap.error("--top doit être compris entre 1 et 50.")
    return a


def main(argv=None):
    args = parse_args(argv)
    mem = get_mem()
    if mem is None:
        print("Erreur : impossible de lire les informations mémoire sur cette machine.",
              file=sys.stderr)
        return 1
    procs = get_procs(mem["total"], args.top)
    L = []
    L.append("Mémoire vive (RAM)")
    L.append(f"  Totale     : {fmt(mem['total'], args.unite)}")
    L.append(f"  Libre      : {fmt(mem['libre'], args.unite)}")
    L.append(f"  Disponible : {fmt(mem['dispo'], args.unite)}")
    L.append(f"  Utilisée   : {fmt(mem['utilisee'], args.unite)} ({mem['pct']:.1f} %)")
    L.append("")
    L.append(f"Top {len(procs)} des processus consommateurs de mémoire :")
    if procs:
        for i, p in enumerate(procs, 1):
            L.append(f"  {i}. {p['nom']} (PID {p['pid']}) — "
                     f"{fmt(p['rss'], args.unite)} — {p['pct']:.1f} % de la RAM totale")
    else:
        L.append("  (aucun processus détecté)")
    L.append("")
    if procs:
        gros = procs[0]
        L.append(f"Résumé : {mem['pct']:.1f} % de la RAM est utilisée "
                 f"({fmt(mem['utilisee'], args.unite)} sur {fmt(mem['total'], args.unite)}). "
                 f"Le plus gros consommateur est « {gros['nom']} » avec "
                 f"{fmt(gros['rss'], args.unite)} ({gros['pct']:.1f} %). "
                 f"RAM disponible : {fmt(mem['dispo'], args.unite)}.")
    else:
        L.append(f"Résumé : {mem['pct']:.1f} % de la RAM est utilisée. "
                 f"RAM disponible : {fmt(mem['dispo'], args.unite)}.")
    texte = "\n".join(L)
    print(texte)
    if args.output:
        try:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(texte + "\n")
        except OSError as e:
            print(f"Erreur : impossible d'écrire {args.output} : {e}", file=sys.stderr)
            return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())