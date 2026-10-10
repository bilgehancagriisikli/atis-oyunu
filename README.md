# 🎯 Atış Arenası

Tarayıcıda çalışan, **3D, çok oyunculu (P2P)** bir atış oyunu. Kurulum veya sunucu kiralama gerekmez:
dosyaları Cloudflare'e yüklemen yeterli. Admin (**MPC**) oyunu başlatır, arkadaşların oyuncu
kodu ve kendi isimleriyle doğrudan katılır.

## Özellikler

- **3D harita "Liman Üssü"**: 4 bina (içine girilebilir, çatılara rampa/merdivenle çıkılır),
  binaları birbirine bağlayan köprü, merkezde rampalı platform, konteyner yığınları, sandıklar,
  bariyerler, ağaçlar.
- **Paraşütle rastgele düşen kutular**: turuncu kutulardan rastgele silah, yeşil kutulardan +50 can,
  mavi kutulardan **jetpack** çıkar.
- **Jetpack**: havadayken `Boşluk` tuşunu basılı tut, yukarı uçarsın. Yakıt yerde kendiliğinden dolar;
  ölünce jetpack gider.
- **Binilebilen araçlar** (yanına git, `E` ile bin / in; binince kamera üçüncü şahsa geçer, `V` ile değişir):
  - **4 motosiklet**: `W`/`S` gaz-fren, `A`/`D` direksiyon, `Shift` nitro, `Boşluk` zıplama.
    Atlama rampalarından uçar, çarptığı oyuncuya hasar verir. Sürerken ateş edebilirsin.
  - **2 dev çinçilla** (gri tüylü, kocaman kulaklı): bakış yönünde zıplayarak gider, `Boşluk` ile
    6 m'ye kadar zıplar, yüksekten indiği yerdeki oyuncuları ezer. Kapılardan sığmaz.
  - Araçtaki oyuncuyu vurmak mümkün; araca isabet daha az hasar verir. Terk edilen araç 90 sn sonra
    park yerine döner.
- **14 silah** (herkes tabancayla doğar, diğerleri kutulardan gelir). Silahlar 1–7 tuşlarına gruplanmıştır;
  aynı tuşa tekrar basınca gruptaki sonraki silaha geçilir:

  | Tuş | Silah | Özelliği |
  |---|---|---|
  | 1 | Tabanca | Sınırsız mermi, kafa vuruşu ×2 |
  | 2 | Pompalı Tüfek | 10 saçma, yakında öldürücü |
  | 2 | Minigun | Önce ısınır, sonra mermi yağdırır (taşırken yavaşlarsın) |
  | 3 | **Bazuka** | Patlayan roket, alan hasarı, savurma (roket zıplaması yapılabilir) |
  | 3 | Bomba Atar | Sekip patlayan el bombaları |
  | 3 | **Zikzak Topu** | Zikzak çizerek gider, bir rakibin yakınından geçince patlar |
  | 4 | **Lazer Işını** | Basılı tuttukça sürekli ışın |
  | 4 | Dondurucu Işın | Vurduğunu yavaşlatır, ekranı buzlanır |
  | 4 | Raylı Top | Duvara kadar herkesi delip geçen ışın, sarmal iz |
  | 5 | Yıldırım Silahı | Hedefe kilitlenir, yakındaki 2 kişiye daha sıçrar |
  | 5 | **Sarmal Testere** | Üç testere burgu gibi döne döne gider, oyuncuların içinden geçer |
  | 6 | **Kara Delik Topu** | Çarptığı yerde herkesi içine çeken kara delik açar |
  | 6 | **Beyaz Delik Topu** | Kara deliğin tersi: herkesi dışarı fırlatır, sonunda patlar |
  | 7 | **Işınlanma Silahı** | Nişangahın gösterdiği yere ışınlar (yerde mavi hedef halkası görünür). Birinin üstüne ışınlanırsan onu ezersin |

- **Mini harita** (sol üstte, dönen) ve **büyük harita** (`M`): kutular, araçlar, kara/beyaz delikler ve
  ateş eden düşmanlar görünür.
- Skor tablosu, öldürme akışı, sohbet, vuruş işaretleri, hasar yönü göstergesi, doğma koruması.
- Kodla üretilen sesler ve dokular: dışarıdan resim/ses dosyası yok.
- **Admin paneli** (Esc menüsünde): oyuncu atma, skorları sıfırlama, kutu yağdırma, araçları park yerine gönderme.

## Erişim kodları

İki kod vardır:

| Kod | Varsayılan | Ne yapar |
|---|---|---|
| Admin kodu | `MPC-ADMIN-2026` | Sunucuyu başlatır. İsim otomatik **MPC** olur. |
| Oyuncu kodu | `ATIS-2026` | Kullanıcı adıyla doğrudan oyuna katılır. |

- Admin oyunu başlatmadıysa oyuncular **"Admin oyunu henüz başlatmadı!"** hatası alır ve giremez.
- Admin oyundan çıkarsa sunucu kapanır, herkes giriş ekranına döner.
- "MPC" ismi admin'e ayrılmıştır; aynı anda iki kişi aynı ismi kullanamaz.
- Kodlar büyük/küçük harf duyarlı değildir.

> ⚠️ **Yayınlamadan önce kodları değiştir.** `araclar/kod-olusturucu.html` dosyasını tarayıcıda aç,
> yeni admin ve oyuncu kodunu yaz, çıkan 3 satırı `public/js/config.js` içindeki aynı satırlarla değiştir.
> Kodların kendisi değil, SHA-256 özetleri saklanır; sayfa kaynağına bakan kişi kodu göremez.
> Admin, katılan her oyuncunun kodunu ayrıca kendi tarafında doğrular.

## Cloudflare'e yükleme

Oyunun tamamı `public/` klasöründedir; derleme adımı yoktur.

**A) Cloudflare Pages, doğrudan yükleme (en kolayı)**
1. Cloudflare panelinde **Workers & Pages → Create → Pages → Upload assets**.
2. `public` klasörünün **içindekileri** sürükleyip bırak, **Deploy**'a bas.

**B) Cloudflare Pages + GitHub**
1. **Workers & Pages → Create → Pages → Connect to Git**, bu depoyu seç.
2. Framework preset: *None*, Build command: *(boş)*, Build output directory: **`public`**.

**C) Wrangler (komut satırı)**
```bash
npx wrangler deploy        # wrangler.jsonc, public/ klasörünü yayınlar
```

**Var olan bir siteye eklemek:** `public` klasörünün içeriğini sitende bir alt klasöre
(ör. `/oyun/`) koyabilirsin; tüm yollar görelidir.

## Nasıl oynanır

1. Admin siteyi açar, admin kodunu girer, **SUNUCUYU BAŞLAT**'a basar (isim: MPC).
2. Oyuncular siteyi açar, oyuncu kodunu ve kullanıcı adını girer, **OYUNA KATIL**'a basar.
3. Ekrana tıkla (fare kilitlenir) ve oyna. `Esc` menüyü açar.

**Admin'in sekmesi açık kalmalı**: sunucu admin'in tarayıcısında çalışır.

### Kontroller

| Tuş | Görev |
|---|---|
| `W A S D` / ok tuşları | Hareket |
| Fare | Nişan |
| Sol tık | Ateş (basılı tut) |
| `Boşluk` | Zıpla |
| `Shift` | Koş (motosiklette nitro) |
| `1`–`7`, tekerlek | Silah seç (aynı tuş: gruptaki sonraki silah) |
| `Q` | Önceki silah |
| `E` | Araca bin / in |
| `V` | Birinci / üçüncü şahıs kamera |
| `Boşluk` (havada, basılı) | Jetpack ile uç |
| `Tab` | Skor tablosu |
| `M` | Büyük harita |
| `T` / `Enter` | Sohbet |
| `Esc` | Menü / ayarlar |

### Telefonda

Telefona **mouse ve klavye** bağla (USB-OTG adaptörü veya Bluetooth), Chrome ile siteyi aç,
menüden **Tam ekran**'a bas ve telefonu yatay tut. Ayarlardan grafik kalitesini **Düşük** yapmak
akıcılığı artırır (telefonda varsayılan zaten düşüktür).

## Teknik notlar

- **Grafik:** [Three.js](https://threejs.org) (r180, `public/vendor/` içinde).
- **Ağ:** [PeerJS](https://peerjs.com) ile WebRTC. Admin'in tarayıcısı sunucudur (yıldız yapı); oyuncular
  yalnızca admin'e bağlanır. Bağlantıyı kurmak için PeerJS'in ücretsiz sinyal sunucusu
  (`0.peerjs.com`) kullanılır; oyun verisi doğrudan oyuncular arasında akar.
- Hareket her oyuncunun kendi tarayıcısında hesaplanır (gecikmesiz his); can, skor, kutular,
  doğma ve hasar admin tarafında onaylanır.
- Bazı katı ağlarda (kurumsal ağ, bazı mobil operatörler) doğrudan bağlantı kurulamayabilir.
  PeerJS'in varsayılan TURN sunucusu denenir; sorun olursa `config.js` içindeki `ICE_SERVERS`
  alanına kendi TURN sunucunu yazabilirsin. Kendi PeerJS sunucun varsa `PEER_SERVER` alanını kullan.
- Oyun güncellendiğinde `config.js` içindeki `VERSION` değerini artır; eski sürümle kalan
  oyunculardan sayfayı yenilemeleri istenir.
- Varsayılan en fazla 12 oyuncu (`MAX_PLAYERS`). Tüm trafik admin'in bağlantısından geçtiği için
  oyuncu sayısı arttıkça admin'in internet hızı önem kazanır.

### Yerel test

```bash
cd public
python3 -m http.server 8080      # veya: npx serve .
```
Tarayıcıda `http://localhost:8080` adresini aç. Aynı bilgisayarda iki farklı tarayıcı
(veya bir normal + bir gizli pencere) ile admin ve oyuncu olarak girerek deneyebilirsin.

### Dosya yapısı

```
public/
  index.html          giriş ekranı + arayüz
  css/style.css
  js/config.js        erişim kodları ve ayarlar  ← burayı düzenle
  js/main.js          giriş akışı, menüler, admin paneli
  js/net.js           PeerJS bağlantıları
  js/host.js          admin (sunucu) oyun mantığı
  js/game.js          oyun döngüsü, oyuncu, silahlar, araç sürüşü, jetpack
  js/vehicles.js      motosiklet ve dev çinçilla: modeller ve sürüş fiziği
  js/map.js           harita ve mini harita
  js/physics.js       çarpışma, hareket, ışın testleri
  js/weapons.js       silah tanımları ve modelleri
  js/effects.js       patlama, lazer, şimşek, kara delik efektleri
  js/avatar.js        diğer oyuncuların karakter modeli
  js/hud.js           ekran arayüzü
  js/audio.js         kodla üretilen sesler
  js/input.js         klavye / fare
  vendor/             three.js ve peerjs (MIT lisanslı)
araclar/kod-olusturucu.html   erişim kodu özeti üretici
```
