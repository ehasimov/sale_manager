// Visual assets sourced from /app/design_guidelines.json
export const ASSETS = {
  loginBackground:
    "https://static.prod-images.emergentagent.com/jobs/f51896a8-a6ca-473b-a5cc-30b2f1c124ff/images/d32d4a12345cdb97ac40d54c4e7d2a0daa2f445876136ba0e00f878f3b28c662.png",
  syncGraphic:
    "https://static.prod-images.emergentagent.com/jobs/f51896a8-a6ca-473b-a5cc-30b2f1c124ff/images/152767d12ca0c4b35e3b071ee0963dd7448af6b9069a148e0fcbf4505389b30d.png",
  storeShelves: [
    "https://images.unsplash.com/photo-1734772337649-79615ba2f176?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHw0fHxzdXBlcm1hcmtldCUyMHJldGFpbCUyMHNoZWxmfGVufDB8fHx8MTc3ODI0MDk3N3ww&ixlib=rb-4.1.0&q=85",
    "https://images.unsplash.com/photo-1606824722920-4c652a70f348?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwxfHxzdXBlcm1hcmtldCUyMHJldGFpbCUyMHNoZWxmfGVufDB8fHx8MTc3ODI0MDk3N3ww&ixlib=rb-4.1.0&q=85",
    "https://images.unsplash.com/photo-1775210291382-ad3c5a50b9af?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA3MDR8MHwxfHNlYXJjaHwzfHxzdXBlcm1hcmtldCUyMHJldGFpbCUyMHNoZWxmfGVufDB8fHx8MTc3ODI0MDk3N3ww&ixlib=rb-4.1.0&q=85",
  ],
};

// Pick a stable shelf image per customer code (deterministic)
export function shelfFor(code: string) {
  let h = 0;
  for (let i = 0; i < code.length; i++) h = (h * 31 + code.charCodeAt(i)) >>> 0;
  return ASSETS.storeShelves[h % ASSETS.storeShelves.length];
}
