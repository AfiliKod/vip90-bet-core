# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

## Capacitor (iOS)

`capacitor.config.json` üretim yapılandırmasıdır: `server.url` yoktur, uygulama
paketlenmiş `dist/` içeriğini kullanır (`npm run cap:sync` = build + `cap sync`).
Geliştirmede cihazı Vite dev sunucusuna bağlamak için:

```bash
CAP_SERVER_URL=http://<makine-LAN-IP>:5173 npm run cap:sync:dev -- ios
```

Betik yapılandırmayı geçici olarak dev URL'siyle yazar, `cap sync` çalıştırır ve
dosyayı eski haline döndürür (Capacitor JSON yapılandırmasında env desteklemez).
`localhost` cihazdan bu makineyi göstermez; LAN IP kullanın.
