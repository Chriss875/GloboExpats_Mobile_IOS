import json, urllib.request
for pid in (619, 629, 615, 485):
    try:
        d = json.load(urllib.request.urlopen(f"http://localhost:8083/api/v1/displayItem/itemDetails/{pid}", timeout=20))
        print(pid, "name=", d.get("productName"), "| qty=", d.get("productQuantity"), "| sold=", d.get("soldQuantity"), "| price=", d.get("price"), "| imgs=", len(d.get("images") or d.get("imageUrls") or []), "| rental=", bool(d.get("rentalConfiguration")))
    except Exception as e:
        print(pid, "ERR", e)
