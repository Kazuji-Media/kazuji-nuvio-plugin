# Kazuji Media

Agregador completo de **add-ons Stremio HTTP**, com duas formas de instalação no Nuvio:

| Instalação | Onde executa | Hospedagem | TorBox já conectado ao Nuvio |
| --- | --- | --- | --- |
| Plugin JavaScript | No aparelho, Nuvio Mobile Full 0.5.4-beta ou runtime compatível | Manifesto e JS estáticos; GitHub Pages funciona | Este adaptador só devolve HTTP; Mobile não resolve plugins pela rota TorBox |
| Add-on HTTP | Servidor Node.js | Node 22+, Docker opcional, HTTPS | Sim: devolve torrents para a rota de resolução do próprio Nuvio |

**NuvioTV:** use o add-on HTTP. O runtime JS revisado em `dev` possui fetch bloqueante e não disponibiliza timers assíncronos. As versões Play Store/App Store também podem não incluir plugins JS. Veja [a auditoria dos contratos](docs/NUVIO.md).

Não há fontes ou credenciais embutidas. Informe os manifestos já configurados dos add-ons que você usa. Este projeto consulta o recurso `stream`; não executa código de outros plugins JS, DEX ou extensões de navegador.

## Como a seleção funciona

1. Consulta os manifestos em paralelo com a resolução dos IDs e classificações via TMDB.
2. Libera as buscas de streams somente após passar pelo filtro de idade.
3. Consulta os add-ons em paralelo, respeitando tipos e prefixos de IDs anunciados no manifesto.
4. Normaliza qualidade e idioma de áudio, preserva headers e legendas, remove duplicatas.
5. Ordena por 4K → 1080p → 720p → 480p e por preferência de áudio.
6. No plugin nativo, usa a velocidade declarada pela fonte, quando disponível, **sem requisitar os vídeos**. O add-on HTTP pode testar amostras em paralelo no servidor.
7. Após a primeira fonte aceita, aguarda uma janela curta (650 ms por padrão) para permitir outras qualidades/idiomas. Retorna, por padrão, **uma fonte por qualidade e idioma**, em ordem decrescente de resolução. Se as buscas terminarem, retorna antes. A quantidade e o agrupamento são configuráveis.

O prazo de seleção padrão é 6,5 segundos, incluindo TMDB. No servidor Node, conexões pendentes são canceladas e uma fonte pendurada não prende a resposta. **No plugin JS, esse prazo não garante o tempo de retorno ao app:** o runtime do Nuvio pode continuar aguardando requisições nativas mesmo depois de o motor concluir a seleção. Veja os limites abaixo. `settleMs: 0` favorece o primeiro resultado; uma janela maior permite mais alternativas. Não é possível devolver imediatamente o primeiro e, simultaneamente, garantir todas as qualidades de fontes ainda pendentes. O Nuvio espera uma única lista por execução, sem atualização incremental dentro do plugin.

Dentro de cada qualidade, prefere o primeiro idioma configurado, depois o idioma original da obra informado pelo TMDB, e então as preferências extras. Exemplo: `languages: ["pt-BR","en"]` com anime originalmente japonês resulta em 4K pt-BR → 4K ja → 4K en → 1080p pt-BR → 1080p ja → 1080p en, quando essas fontes existem. Áudios não preferidos vêm depois; desconhecidos ficam por último. Uma URL com múltiplos áudios entra no grupo de maior preferência, sem duplicação.

Dentro do mesmo grupo de idioma, a maior velocidade informada prevalece no plugin nativo. No add-on HTTP, fontes aprovadas precedem alternativas não verificadas e a velocidade medida por amostra prevalece. Se indisponível, aceita os campos numéricos `speedMbps` ou `downloadSpeedMbps` da fonte como informação **declarada**, sem convertê-la em aprovação. O campo genérico `speed` não é usado porque suas unidades são ambíguas. No add-on HTTP, as velocidades mínimas padrão são 20 / 6 / 3 / 1 Mbps para 4K / 1080 / 720 / 480. São limites configuráveis, não uma garantia de reprodução: bitrate, codec, HDR, aparelho e oscilação de rede também influenciam.

O Nuvio não injeta o idioma do aparelho no plugin: configure-o manualmente, com padrão `pt-BR`. O TMDB informa a língua original, normalmente sem região; o Kazuji não inventa `en-US` a partir de `en`. O app Mobile pode reordenar a lista alfabeticamente; a ordem devolvida pelo plugin não garante a ordem visual. Veja [a auditoria](docs/NUVIO.md).

### Apresentação das fontes

O rótulo nativo (`name`) contém três linhas; `title` repete o conteúdo para consumidores que o utilizam:

```text
Nome da obra (2024) · 4K · Áudio: pt-BR · WEB-DL · HEVC · HDR10+ · DD+ · 5.1
Diretor/criador · Estúdio
Classificação BR: 12 · 35.2 Mbps (fonte informa; não verificado) · 4.5 GB · Nome da fonte
```

Título/ano, direção (filmes), criadores (séries), produtoras e certificações vêm do TMDB. Séries mostram o ano de estreia e a classificação da série. Campos ausentes aparecem como “não informado”; classificação de outro país não substitui silenciosamente a do país escolhido. No add-on HTTP, o nome do grupo identifica qualidade/idioma e `title` contém as três linhas. A disposição/truncamento final depende da versão do aplicativo.

### Emblemas Fusion (padrão automático)

A partir da 1.1.4, o Kazuji prepara os termos de resolução, fonte (REMUX/BluRay/WEB-DL/WEBRip), codec, HDR/Dolby Vision, áudio, canais, edição e profundidade de cor automaticamente. Usa o nome original do arquivo, campos declarados e metadados `clientResolve` disponíveis. Não exige nova configuração nem consultas extras; mantém os filtros e preferências existentes. Informações desconhecidas são omitidas: sucesso na reprodução não comprova HEVC, HDR, Atmos ou áudio dublado. Legendas e idioma original do TMDB não viram emblemas de áudio.

Em **Nuvio → Configurações → Streams → URLs de emblemas Fusion**, importe uma vez:

```text
https://joaovpimenta.github.io/kazuji-media/badges.json
```

O pacote 1.1.5 deriva da [base indicada pelo usuário](https://pastebin.com/raw/mduTTf4M): preserva os 20 ícones originais, cores e bordas, e acrescenta 34 complementos monocromáticos para fonte, codec, áudio, canais, edição e idiomas. As resoluções ficam ativas por padrão; as regras aceitam os rótulos de três linhas e mostram Atmos junto do codec conhecido. Os metadados também funcionam com outros pacotes cujas regras reconheçam esses termos. Veja [a origem e os ajustes](docs/FUSION.md).

Na 1.1.6, WEB-DL, SDR e 6.1 também usam ícones das coleções originais. Os demais complementos ganham símbolos e tipografia vetorial branca maior, com uma única borda aplicada pelo Nuvio. As novas URLs `-v2.svg` evitam reutilizar o artwork antigo do cache. Veja [a prévia](docs/fusion-preview.png). Depois da atualização, reimporte a mesma URL do pacote no Nuvio.

No servidor HTTP, a página `/configure` permite copiar a URL `/badges.json` da própria instância; configure `PUBLIC_URL` para os complementos SVG usarem esse host. Sem `PUBLIC_URL`, esses SVGs usam GitHub Pages. Os ícones originais continuam nos endereços dos respectivos autores no GitHub. O plugin não altera as configurações globais do Nuvio nem importa o pacote pelo usuário.

Ative **Emblemas de tamanho** e **Logótipo do addon** no Nuvio. O add-on HTTP mantém o nome real do arquivo em `behaviorHints.filename` e o tamanho em bytes em `behaviorHints.videoSize`. Prioriza os metadados da fonte; aceita tamanhos declarados com unidades SI/IEC e, quando houver teste HTTP, o total válido de `Content-Range` ou `Content-Length` de uma resposta completa. O tamanho de uma amostra parcial ou segmento HLS não vira tamanho total. No plugin JS, o tamanho conhecido aparece em texto e no campo `size`, pois o conversor atual do app não oferece o emblema nativo de tamanho para plugins. O logotipo é declarado nos dois manifestos.

O preparo Fusion não inicia testes de vídeo no plugin JS. A posição dos emblemas e a ativação do pacote continuam sendo opções do Nuvio.

### Testes de fonte no add-on HTTP

- URLs diretas HTTP(S): amostra com `Range`; respostas HTTP inválidas, HTML/JSON e amostras pequenas não viram resultados aprovados.
- HLS: segue playlists, escolhe variante com a resolução anunciada e testa um segmento. Também detecta playlists em URLs sem extensão.
- HLS criptografado/byte-range e DASH: não recebem aprovação de velocidade nesta implementação; só podem aparecer com a opção explícita de alternativas sem velocidade aprovada.
- HEAD confirma somente resposta HTTP, sem medir throughput. Precisa da opção de alternativas para aparecer.
- Torrents e `clientResolve`: são alternativas delegadas ao Nuvio no modo HTTP. **Não são testados antes da resolução** e ficam depois de links aprovados do mesmo grupo de qualidade/idioma. O limite configurado pode ocultá-los se esse grupo já tiver fontes melhores.

O plugin JS não testa vídeos. Esses testes são exclusivos do add-on HTTP e ocorrem **na conexão do servidor**, não na conexão do espectador. Um teste curto é uma estimativa daquele momento.

## Instalar o plugin JavaScript

Use **Nuvio Mobile Full 0.5.4-beta** ou um runtime com timers assíncronos e `response.arrayBuffer()`. A 0.5.1-beta não tem essas APIs; a 0.5.2-beta e a 0.5.3-beta têm leitura de bytes, mas não os timers. Na 0.5.1-beta o Kazuji retorna vazio antes de consultar fontes.

1. Disponibilize `manifest.json` e `providers/kazuji.js` em um host HTTPS acessível ao Nuvio, mantendo os caminhos relativos.
2. Em plugins/repositórios do Nuvio Mobile Full, adicione a URL do `manifest.json`.
3. Abra as configurações do Kazuji e informe os manifestos das fontes, idiomas, classificações e prazos.

As qualidades são selecionadas individualmente: **4K, 1080p, 720p, 480p e qualidade desconhecida**. No Mobile, cada opção é um botão liga/desliga; na página web, uma caixa de seleção. Ative uma ou mais. Por padrão, as quatro resoluções conhecidas estão ativas e a desconhecida está desativada. As configurações antigas do campo textual `qualities` continuam funcionando.

Com GitHub Pages habilitado em **Settings → Pages → Deploy from a branch → main / root**, o endereço esperado é:

```text
https://joaovpimenta.github.io/kazuji-media/manifest.json
```

Esse endereço só funciona após a publicação do Pages. O repositório estava **privado** na implementação: o Nuvio não usa sua sessão do GitHub para baixar arquivos privados. Não instale URLs raw temporárias com token de acesso. Pages em repositórios privados depende do plano GitHub; a publicação deve permitir acesso ao app. Não é necessário tornar o repositório público se você hospedar os dois arquivos em outro host.

GitHub Pages hospeda o plugin estático; **não executa o servidor HTTP**.

Exemplo de campo Manifestos (URLs ilustrativas, substitua):

```json
[
  "https://addon-a.example/configuracao/manifest.json",
  "https://addon-b.example/manifest.json"
]
```

Aceita uma URL inteira, várias por linha ou separadas por vírgula. Vírgulas internas de uma URL configurada (por exemplo `qualityfilter=threed,480p,scr,cam,unknown`) são preservadas: a vírgula separa fontes somente quando é seguida de outra URL HTTP(S). Para URLs com separadores ambíguos, use o array JSON acima. Em versões anteriores a 1.1.2, URLs com vírgulas internas exigem esse array JSON.

O plugin usa `SCRAPER_SETTINGS`, exporta `onSettings()` e aproveita `TMDB_API_KEY` fornecida pelo Nuvio. Consulte [os contratos verificados](docs/NUVIO.md) antes de usar builds antigos.

## Instalar o add-on HTTP com TorBox opcional

```sh
npm start
```

Abra `http://localhost:7000/configure`, preencha as fontes e gere o endereço de instalação. Adicione esse endereço em **Add-ons**, como manifesto HTTP, no Nuvio.

Para usar a conta TorBox do app:

1. Ative “Devolver torrents para o Nuvio resolver” na configuração Kazuji.
2. Conecte o TorBox nas configurações de debrid do Nuvio e selecione-o como resolvedor ativo.
3. O Kazuji preserva `infoHash`, `fileIdx`, trackers, `behaviorHints` e `clientResolve`. O Nuvio verifica cache e resolve o vídeo usando a própria conta.

Sem TorBox, mantenha esse modo desativado: os links diretos continuam funcionando. O servidor não recebe o login/chave TorBox do app, não detecta se ele está conectado e não envia torrents para a conta por conta própria. Se você habilitar torrents sem um resolvedor no app, essas alternativas podem não reproduzir. Resolução/cache de TorBox e escolha de arquivo continuam sujeitos ao suporte da versão do Nuvio.

### Docker

```sh
PUBLIC_URL=https://kazuji.seudominio.example TMDB_API_KEY=sua_chave docker compose up --build -d
```

O Compose expõe apenas `127.0.0.1:7000`; coloque um proxy HTTPS na frente. Para uso pessoal, comece com uma instância pequena de Node e meça memória/concorrência. Não há banco externo, Redis ou proxy de vídeo obrigatório: as configurações ficam num volume de arquivos, e o vídeo toca diretamente na fonte. Amostras geram tráfego de rede; reduza `maxProbes`/`sampleBytes` se necessário.

| Variável | Uso |
| --- | --- |
| `PORT` | 7000 por padrão |
| `HOST` | `0.0.0.0` por padrão |
| `PUBLIC_URL` | URL HTTPS pública, usada para validação de origem e prevenção de fonte recursiva |
| `TMDB_API_KEY` | Chave API v3 do TMDB; necessária para mapear IDs e consultar classificações no servidor |
| `DATA_DIR` | Diretório persistente das configurações; padrão `./data` |
| `KAZUJI_CONFIG_FILE` | Arquivo JSON para configurar o manifesto padrão `/manifest.json` |
| `ALLOW_HTTP_UPSTREAMS` | `true` permite fontes sem TLS; desativado por padrão no servidor |
| `ALLOW_PRIVATE_UPSTREAMS` | `true` permite destinos de rede local; use somente em instalação controlada |

O servidor limita tamanho de respostas, requisições simultâneas, configurações e solicitações por IP. Valida DNS/destinos e redirecionamentos, fixa o IP validado na conexão e bloqueia rede privada por padrão. Não há autenticação de administradores ou compartilhamento entre instâncias; o diretório de dados é para **uma instância**. Proteja e faça backup do volume. O limite por IP usa o endereço do socket; atrás de um proxy ele pode ser compartilhado por todos os clientes.

Configurações salvas recebem um identificador aleatório opaco de 192 bits. As URLs das fontes não aparecem no manifesto público. O endereço de instalação é uma credencial de acesso à configuração; guarde-o com cuidado. Os logs próprios registram apenas contadores/tempos, sem tokens ou URLs. O runtime do Nuvio pode ter logs próprios de requisições.

### Rotas

| Rota | Resposta |
| --- | --- |
| `GET /configure` | Página de configuração |
| `POST /api/config` | Salva configuração JSON e devolve `manifestPath` |
| `GET /c/{id}/manifest.json` | Manifesto configurado |
| `GET /c/{id}/stream/movie/{id}.json` | Streams de filme |
| `GET /c/{id}/stream/series/{id}:{season}:{episode}.json` | Streams de episódio |
| `GET /manifest.json` e `GET /stream/...` | Configuração padrão do servidor |
| `GET /health` | Estado e versão |

Aceita IDs IMDb (`tt123...`) e TMDB (`tmdb:123...`), com codificação URL normal. Não agregamos catálogos, metadados ou add-ons de legendas como recursos separados; legendas presentes nas respostas de streams são preservadas.

## Configuração

Os campos mais usados aparecem na interface. No plugin, use “Configuração avançada JSON” para os demais. No servidor, a página oferece o mesmo campo; `KAZUJI_CONFIG_FILE` também aceita todo o objeto. **Desde a 1.1.3, o plugin nativo sempre usa `probeMode: "off"` e `allowUnverified: true`**, após ler presets, configurações salvas e JSON avançado. Valores antigos não reativam testes nem bloqueiam todas as fontes por ausência de teste. Os controles de testes foram removidos da interface nativa; os campos de amostra da tabela aplicam-se apenas ao servidor.

| Campo | Padrão | Descrição |
| --- | --- | --- |
| `manifests` | `[]` | Até 24 URLs HTTP(S). Array, JSON textual ou lista por linha/vírgula |
| `qualities` | `[2160,1080,720,480]` | Qualidades aceitas; `0` aceita resolução desconhecida |
| `languages` | `["pt-BR"]` | Primeiro idioma = principal manual; idioma original entra em segundo, demais depois |
| `resultMode` | `per_language` | `per_language`: grupos qualidade/idioma; `per_quality`: grupos por qualidade; `all`: todas as fontes válidas dentro dos orçamentos/prazos |
| `resultsPerGroup` | `1` | De 1 a 20 fontes por grupo; ignorado em `all` |
| `languageMode` | `prefer` | `prefer`; `strict` aceita preferências e idioma original; `any` desativa preferência de áudio |
| `allowUnknownLanguage` | `true` | Em modo estrito, desative para rejeitar áudio sem identificação |
| `allowedCodecs` | `[]` | Vazio aceita todos; `h264`, `hevc`, `av1` (aliases x264/x265 aceitos) |
| `hdrMode` | `any` | `any`, `sdr` (rejeita HDR/Dolby Vision), `no_dolby_vision` |
| `allowUnknownCompatibility` | `true` | Permite codec/HDR ausente quando o filtro correspondente está ativo |
| `country` | `BR` | País ISO de duas letras para classificação |
| `allowedRatings` | `[]` | Códigos exatos permitidos; vazio desativa filtro |
| `unknownRating` | `block` | Bloquear ou permitir quando a classificação é desconhecida |
| `totalTimeoutMs` | `6500` | Prazo global de 500–20000 ms |
| `settleMs` | `650` | Janela de 0–3000 ms após primeira fonte aceita |
| `requestTimeoutMs` | `2200` | Prazo por requisição de metadados/fonte |
| `probeTimeoutMs` | `1400` | Prazo de todo o teste, inclusive etapas HLS |
| `sourceConcurrency` | `8` | Concorrência por etapa de fontes |
| `probeConcurrency` | `4` | Quantidade de testes simultâneos |
| `maxCandidates` | `48` | Orçamento de candidatos únicos por busca |
| `maxProbes` | `24` | Orçamento de testes por busca |
| `sampleBytes` | `262144` | Tamanho da amostra; 32–512 KiB |
| `minMbps` | `{"2160":20,"1080":6,"720":3,"480":1,"0":1}` | Mínimo observado por qualidade |
| `probeMode` | `sample` no HTTP; `off` no JS | `sample`, `head` ou `off` no HTTP; sempre `off` no plugin |
| `allowUnverified` | `false` no HTTP; `true` no JS | No HTTP, permite alternativas não aprovadas; no JS, devolve links sem teste de vídeo |
| `torrentMode` | `off` | `native` delega torrents/debrid ao Nuvio, exclusivamente pelo add-on HTTP |
| `tmdbApiKey` | vazio | Sobrescreve chave TMDB; normalmente use chave do app ou variável do servidor |

No formulário nativo, os botões são salvos como `quality2160`, `quality1080`, `quality720`, `quality480` e `quality0`. O adaptador converte os valores em `qualities`; opções ainda não salvas herdam a seleção antiga/preset. O campo avançado JSON é aplicado por último: se declarar `qualities`, ele prevalece sobre os botões. A API HTTP continua recebendo o array `qualities`.

### Idioma e idade

**Áudio:** normaliza campos informados pelas fontes e reconhece rótulos comuns, como PT-BR, Dublado e English. Essa informação pode ser incompleta ou errada. Não inspeciona todas as trilhas dentro do arquivo e não trata legenda/original_language como prova de áudio.

**Idade:** aplica a classificação **do título**, consultada no TMDB para o país escolhido, antes de buscar streams. Exemplo BR: `allowedRatings: ["L","10","12"]`. Com esse filtro ativo, classificação ausente/falha de TMDB bloqueia por padrão; códigos conflitantes exigem que todos sejam permitidos. Com a lista vazia, o filtro fica desligado e classificação ausente é identificada no rótulo. TV usa a classificação da série, não uma garantia específica de cada episódio. Não altera catálogos do Nuvio, não é controle parental do app e não impede uso de outros add-ons.

**Compatibilidade:** filtra campos `codec`/`videoCodec`, `hdr`/`dynamicRange` e rótulos de arquivo. `hdr: false` ou SDR explícito identifica SDR. Ausência de HDR no nome não prova SDR. Não consulta a capacidade real do aparelho nem analisa o vídeo inteiro; mantenha os filtros conforme seu dispositivo. `allowUnknownCompatibility: false` rejeita informações ausentes apenas para filtros ativos.

### Limites do runtime nativo

O plugin nativo consulta somente manifestos, metadados TMDB e respostas de streams. Não faz HEAD, downloads de amostras nem consultas a playlists/segmentos de vídeo. A velocidade é desconhecida ou apenas declarada pela fonte; a disponibilidade do link será confirmada na reprodução.

O Mobile revisado limita cada resposta fetch a 1 MiB e não implementa aborto físico via `fetch(signal)`. Na 0.5.4-beta, QuickJS-kt aguarda todos os jobs nativos da avaliação, inclusive `fetch` e sleeps de timers que `clearTimeout` apenas desativa em JavaScript. O cliente HTTP Android usa timeouts de conexão/leitura/escrita de 60 s, e a execução do plugin também tem limite de 60 s. Portanto **não garantimos retorno em 6,5 s no runtime nativo**. Remover requisições de vídeo elimina a causa observada no diagnóstico, mas manifestos ou metadados pendurados ainda dependem dos limites do app.

No servidor Node, os testes de vídeo continuam opcionais. A amostra é encerrada assim que o limite de bytes chega, e a conexão é cancelada no timeout/retorno. O prazo JS no aparelho depende de timers realmente assíncronos; fetch bloqueante de versões antigas não é suportado.

## Desenvolvimento e verificação

Sem dependências npm externas:

```sh
npm run build
npm test
npm run check
```

`src/aggregator.js` contém o motor compartilhado. `src/provider.js` é o adaptador QuickJS. O build gera `providers/kazuji.js`, um arquivo autocontido. Edite os fontes, não o bundle.

Os testes cobrem corridas, prazo máximo, fontes penduradas, concorrência, deduplicação, idiomas, classificações, preservação de headers/legendas/torrents, HLS e servidor HTTP com upstreams locais. O bundle é executado sem imports Node em um sandbox com o formato de fetch do Nuvio. A CI verifica o bundle e os testes.

Não houve teste em aparelho Nuvio nem reprodução real com uma conta TorBox nesta entrega. A integração usa contratos auditados no código dos aplicativos, documentados abaixo.

## Referências

- [Auditoria Nuvio: entradas, saídas e integrações](docs/NUVIO.md)
- [Protocolo Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html)
- [Resposta stream Stremio](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html)
- [Classificações de filme TMDB](https://developer.themoviedb.org/reference/movie-release-dates)
- [Classificações de série TMDB](https://developer.themoviedb.org/reference/tv-series-content-ratings)
- [GitHub Pages e planos disponíveis](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages)
