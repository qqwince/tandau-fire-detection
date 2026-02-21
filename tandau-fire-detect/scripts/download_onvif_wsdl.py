#!/usr/bin/env python3
"""
Скачивает папку wsdl из python-onvif-zeep для работы ONVIF без ошибки "onvif.xsd not found".
Выполните один раз: python scripts/download_onvif_wsdl.py
"""
import os
import sys
import urllib.request

BASE = "https://raw.githubusercontent.com/FalkTannhaeuser/python-onvif-zeep/zeep/wsdl"
# Минимальный набор для devicemgmt, media, ptz (и их зависимости)
FILES = [
    "devicemgmt.wsdl", "media.wsdl", "ptz.wsdl", "imaging.wsdl", "events.wsdl",
    "onvif.xsd", "b-2.xsd", "bf-2.xsd", "r-2.xsd", "t-1.xsd",
    "types.xsd", "ws-addr.xsd", "ws-discovery.xsd", "xml.xsd",
    "addressing", "envelope", "include", "xmlmime",
    "analytics.wsdl", "deviceio.wsdl", "bw-2.wsdl", "rw-2.wsdl",
]

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    wsdl_dir = os.path.join(script_dir, "..", "wsdl")
    wsdl_dir = os.path.normpath(wsdl_dir)
    os.makedirs(wsdl_dir, exist_ok=True)

    for name in FILES:
        url = f"{BASE}/{name}"
        path = os.path.join(wsdl_dir, name)
        try:
            urllib.request.urlretrieve(url, path)
            print(f"OK: {name}")
        except Exception as e:
            print(f"FAIL: {name} - {e}", file=sys.stderr)
    print(f"\nWSDL сохранено в: {wsdl_dir}")

if __name__ == "__main__":
    main()
