# Pacote Fusion derivado

A versão 1.1.5 usa como referência https://pastebin.com/raw/mduTTf4M, consultada em 30/09/2026. A cópia recebida está em `badges.base.json`, sem alterações nas regras ou estados originais. O campo de teste `text` do primeiro filtro também foi preservado nessa referência.

Os 20 filtros da base mantêm seus IDs, nomes, ícones, `tagColor`, `textColor` e `borderColor` no pacote derivado. Os ícones originais continuam referenciados nos repositórios [nobnobz/Omni-Template-Bot-Bid-Raiser](https://github.com/nobnobz/Omni-Template-Bot-Bid-Raiser) e [9mousaa/BetterFormatter](https://github.com/9mousaa/BetterFormatter). Os novos ícones seguem a apresentação monocromática branca, com fundo transparente e o estilo discreto da base aplicado pelo Nuvio.

## Ajustes na derivação

- Ativa 4K, 1080p e 720p, desativados na referência. As demais opções continuam ativas.
- Usa `filled` com `borderColor` para aplicar preenchimento e borda no renderer atual do Nuvio Mobile, que testa `tagStyle == "filled"`.
- Acrescenta DOTALL aos filtros com `(?i)` para aceitar os rótulos de várias linhas do Kazuji, incluindo as regras ancoradas de HDR10/HDR10+.
- Separa IMAX da qualidade da fonte, Atmos do codec de áudio e Dolby Vision da camada HDR. Permite mostrar TrueHD/DD+ junto de Atmos, e HDR10 junto de Dolby Vision quando ambos foram declarados; mantém as demais regras de prioridade da base.
- Restringe os emblemas 7.1 e 5.1 aos canais declarados: 8.0 não é 7.1, e 5.0 não é 5.1.
- Acrescenta 34 filtros para os metadados complementares: 480p, WEB-DL/WEBRip/HDCAM/DVDRip, codecs, HLG/SDR, AAC/FLAC/PCM/MP3, canais restantes, edições, profundidade de cor e idiomas.
- Mantém desconhecidos sem emblema. Não adiciona consultas de mídia ou importação automática nas configurações do Nuvio.

`src/fusion-extra.json` define os complementos. `scripts/build-badges.js` aplica os ajustes documentados e gera `badges.json` e os SVGs complementares. `npm run build` gera pacote e plugin; `npm run check` verifica ambos. Os 20 SVGs coloridos antigos que foram substituídos pelos ícones originais foram removidos.

O endpoint HTTP só adapta o host dos SVGs complementares quando `PUBLIC_URL` está definido. Não modifica as URLs dos ícones originais.

Após atualizar o pacote no servidor ou no GitHub Pages, importe novamente a mesma URL nas configurações Fusion do Nuvio para substituir as regras já salvas.
