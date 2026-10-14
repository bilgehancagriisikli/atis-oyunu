// ============================================================
//  OYUN AYARLARI
//  Erişim kodlarını değiştirmek için: araclar/kod-olusturucu.html
//  dosyasını tarayıcıda aç, yeni kodları yaz ve çıkan satırları
//  aşağıdakilerle değiştir.
//
//  Varsayılan kodlar (MUTLAKA DEĞİŞTİR):
//    Admin kodu  : MPC-ADMIN-2026
//    Oyuncu kodu : ATIS-2026
// ============================================================

export const CONFIG = {
  // Kodların kendisi değil, SHA-256 özetleri saklanır.
  ADMIN_CODE_HASH: '92fca18d8ea1bc65fb4d8314444a76995b1c29d888d0e73de3fafb7c722d1823',
  PLAYER_CODE_HASH: 'd293232e30b6591306b08c104843e11563d6485b1a8f655655061e94d9472ad0',

  // Admin'in P2P sunucu kimliği. Herkese açık PeerJS sunucusunda benzersiz olmalı.
  ROOM_ID: 'atis-oyunu-073b584c35d2',

  ADMIN_NAME: 'MPC',
  MAX_PLAYERS: 12,

  // null = PeerJS'in ücretsiz bulut sinyal sunucusu (0.peerjs.com).
  // Kendi sunucun varsa: { host: 'ornek.com', port: 443, path: '/', secure: true }
  PEER_SERVER: null,

  // null = PeerJS'in varsayılan STUN/TURN sunucuları.
  ICE_SERVERS: null,

  // Sürüm değişince eski önbellekli istemciler uyarılır.
  VERSION: '1.3.0',
};
