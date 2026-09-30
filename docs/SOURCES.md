# Fontes automáticas · 1.2.1

O catálogo nativo recebe uma única chave TorBox por fornecedor. Não oferece campos de manifestos, ativação individual ou URLs personalizadas. Sem chave, consulta oito fontes HTTP públicas; com chave, acrescenta onze add-ons configurados automaticamente. Cada resposta passa pelo filtro HTTP do plugin: hashes, magnets, arquivos `.torrent` e `about:error` são descartados.

A verificação de 30/09/2026 consultou páginas de configuração e manifestos sem baixar vídeos. Os GET de manifestos TorBox usaram uma chave fictícia; isso valida o formato da configuração e o recurso `stream`, não a autenticação ou reprodução. Os POST de configuração foram verificados pelo código das páginas e por testes simulados, sem criar configurações com credenciais reais.

| Fonte | Integração automática | Contrato verificado |
| --- | --- | --- |
| [Frost Stream](https://froststream.cloutteam.com) | HTTP público | Manifesto público |
| [King Vod](https://da5f663b4690-kingvod.baby-beamup.club/manifest.json) | HTTP público | Manifesto público |
| [BsCine](https://bscine.alwaysdata.net/manifest.json) | HTTP público | Manifesto público |
| [Pop Play](https://site--popplay--rg2h4m5nr425.code.run/manifest.json) | HTTP público | Manifesto público |
| [Mico-Leão Dublado](https://27a5b2bfe3c0-stremio-brazilian-addon.baby-beamup.club/manifest.json) | HTTP público | Manifesto público |
| [Zeus](https://398fe185fed6-zeus.baby-beamup.club/v1-p1kv-q27) | HTTP público | Prefixo fornecido preservado |
| [UnioFlix](https://bcf125302240-unioflix.baby-beamup.club) | HTTP público | Manifesto público |
| [Nexus](https://nexuszen.vercel.app) | HTTP público | Manifesto público; usa debrid do serviço |
| [Torrentio](https://torrentio.strem.fun) | Chave `torbox` na configuração | Seleção BR fornecida, `nodownloadlinks,nocatalog`; GET respondeu 403 nesta rede |
| [Brazuca Torrents](https://94c8cb9f702d-brazuca-torrents.baby-beamup.club) | Chave `torbox` na configuração | `nodownloadlinks,nocatalog`; manifesto TorBox respondeu 200 |
| [Comet](https://comet.elfhosted.com/configure) | JSON em Base64, `debridServices` | TorBox, `cachedOnly`, `enableTorrent:false`; manifesto respondeu 200 |
| [Meteor](https://meteorfortheweebs.midnightignite.me/configure) | JSON em Base64url, `services` | TorBox, `cachedOnly`, `allowP2P:false`; manifesto respondeu 200 |
| [TorrentsDB](https://torrentsdb.com/configure) | JSON em Base64, `torbox` | `debridoptions` exclui links de download; manifesto respondeu 200 |
| [Jackettio](https://jackettio.elfhosted.com/configure) | JSON em Base64, `debridId/debridApiKey` | TorBox, `hideUncached`, todas as qualidades do plugin; manifesto respondeu 200 |
| [Pipe](https://pipe.boringways.workers.dev) | JSON em Base64url, `tb` | `st:http`; manifesto respondeu 200 |
| [Corsaro Viola](https://icv.stremio-italia.eu/configure) | JSON em Base64url, `use_torbox/torbox_key` | `only_debrid_cache`; manifesto respondeu 200 |
| [Indexa Br](https://indexabr.vercel.app) | POST `/gerar` com TorBox | Referência `id` gera manifesto; `torrentOnly:false` |
| [ProwJack](https://prowjack-delta.vercel.app/configure) | POST `/api/config` com `debridConfig` | Referência `userConfig`; TorBox, `enableP2P:false`, `qbitMode:off` |
| [Media Fusion](https://mediafusion.elfhosted.com/app/configure) | POST `/encrypt-user-data` | Referência `encrypted_str`; provider TorBox com streams em cache; instância pública sem API key adicional |

Os formatos vêm das páginas e bundles publicados pelos próprios add-ons. O Comet também publica o [modelo de configuração](https://github.com/g0ldyy/comet/blob/main/comet/core/models.py) e a [validação](https://github.com/g0ldyy/comet/blob/main/comet/core/config_validation.py); o Torrentio publica o [parser](https://github.com/TheBeastLT/torrentio-scraper/blob/master/addon/lib/configuration.js) e as [opções de debrid](https://github.com/TheBeastLT/torrentio-scraper/blob/master/addon/moch/options.js). Esses serviços são independentes e podem mudar seus contratos.

## Fontes excluídas do catálogo nativo

| Fontes da lista original | Motivo |
| --- | --- |
| BeTor, ThePirateBay, Nyaa Anime BR | Não foi identificado um contrato automático TorBox; retornam/ indexam torrents |
| Pengu, Orion | Exigem login ou credencial adicional ao TorBox |
| BrasilRD | Integração indicada com Real-Debrid; sem contrato TorBox confirmado |
| Saimuel | Não forneceu manifesto HTTP utilizável na consulta |
| Fenix Flix, BestCine | Responderam 403; não foi confirmado um manifesto público utilizável |
| SuperStream, Magneto | Timeout/503 na consulta; integração automática não confirmada |

Não existe fallback para o manifesto torrent público quando a configuração TorBox falha. Uma fonte indisponível, uma credencial recusada ou uma referência inválida não impede as demais. Controles antigos `sourceEnabled_*`, `sourceManifest_*`, `manifests` e `useBuiltInSources` não alteram o catálogo, mesmo quando salvos em presets ou JSON avançado.
