# Kilun — app mobile

App de finanças pessoais (Expo / React Native) com dados **locais primeiro**: as
transações ficam num SQLite criptografado (SQLCipher) no aparelho e o app funciona
offline. O backend ([backend-final](https://github.com/TheJhou/backend-final)) cuida
de autenticação, IA (OCR, áudio, categorização), assinaturas e backup na nuvem.

## Estrutura

| Pasta | Conteúdo |
|---|---|
| `app/` | Telas (expo-router). `(app)/` é a área autenticada, com as abas. |
| `components/` | Componentes de UI, incluindo a tela de bloqueio biométrico. |
| `lib/` | Regras e acesso a dados: `db.ts` (schema/migrações), `repositories/`, `auth.ts` (sessão e rede), `backup.ts`, `iap.ts` (Google Play), `local-data.ts` (limpeza ao sair/trocar de conta). |
| `hooks/` | Inclui o listener de notificações bancárias (`use-notification-listener.ts`). |
| `modules/bank-notifications/` | Módulo nativo Android que lê notificações dos apps de banco. |
| `__tests__/`, `__mocks__/` | Testes Jest. O SQLite dos testes é real (`node:sqlite`). |

## Rodando

```bash
npm install
cp .env.example .env        # ajuste EXPO_PUBLIC_API_BASE_URL
npx expo start
```

O app usa módulos nativos (SQLCipher, biometria, leitor de notificações, compras),
então precisa de um **development build** — o Expo Go não basta:

```bash
eas build --profile development --platform android
```

## Testes

```bash
npm test          # Jest — requer Node 22.5+ (usa node:sqlite)
npx tsc --noEmit  # typecheck
npm run lint
```

## Build e publicação

Perfis em `eas.json` (`development`, `preview`, `production`); a URL do backend de
cada perfil também está lá. Compras só funcionam em builds instalados pela faixa de
teste da Google Play.

Ao publicar mudanças que dependem do backend (ex.: exclusão de conta apagando os
backups na nuvem), publique o backend primeiro.
