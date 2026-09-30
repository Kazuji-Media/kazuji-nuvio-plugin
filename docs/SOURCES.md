# Fontes embutidas · 1.2.0

Catálogo fornecido pelo usuário em 30/09/2026. Consultamos somente manifestos; não reproduzimos nem baixamos vídeos. Uma resposta válida de manifesto não comprova disponibilidade dos streams ou suporte a TorBox. Falhas HTTP podem depender da rede/origem e do momento.

Os nove manifestos públicos HTTP válidos começam habilitados. Fenix Flix, BestCine e SuperStream ficam desativados por padrão após 403/timeout nesta consulta; podem ser ativados ou substituídos. Fontes com login/configuração exigem URL personalizada, sem criar endpoints por suposição. Os indexadores públicos ativam com a chave TorBox e só devolvem vídeos resolvidos em cache; sem chave, podem usar um manifesto personalizado que já entregue HTTP.

| Fonte | Link fornecido | Uso no plugin | Consulta de manifesto |
| --- | --- | --- | --- |
| Frost Stream | [frost](https://froststream.cloutteam.com) | HTTP público habilitado | JSON com recurso stream |
| Fenix Flix | [fenix](https://fenixflix.fenixhub.online/configure) | HTTP público opcional, desativado | 403 nesta rede |
| King Vod | [kingvod](https://da5f663b4690-kingvod.baby-beamup.club/manifest.json) | HTTP público habilitado | JSON com recurso stream |
| BsCine | [bscine](https://bscine.alwaysdata.net/manifest.json) | HTTP público habilitado | JSON com recurso stream |
| Pop Play | [popplay](https://site--popplay--rg2h4m5nr425.code.run/manifest.json) | HTTP público habilitado | JSON com recurso stream |
| Mico-Leão Dublado | [mico](https://27a5b2bfe3c0-stremio-brazilian-addon.baby-beamup.club/manifest.json) | HTTP público habilitado | JSON com recurso stream |
| BestCine | [bestcine](https://bestcine.dpdns.org/) | HTTP público opcional, desativado | 403 nesta rede |
| SuperStream | [superstream](https://da5f663b4690-superstream.baby-beamup.club) | HTTP público opcional, desativado | Timeout |
| Zeus | [zeus](https://398fe185fed6-zeus.baby-beamup.club/v1-p1kv-q27) | HTTP público habilitado | JSON com recurso stream |
| Saimuel | [saimuel](https://saimuelptbr-how6fvsx.manus.space) | Manifesto personalizado obrigatório | Não devolveu JSON de manifesto |
| UnioFlix | [unioflix](https://bcf125302240-unioflix.baby-beamup.club) | HTTP público habilitado | JSON com recurso stream |
| BeTor | [betor](https://stremio-betor.onrender.com/) | Chave TorBox ou manifesto HTTP personalizado | JSON com recurso stream |
| Nyaa Anime BR | [nyaa](https://stremio-br-anime.onrender.com/manifest.json) | Manifesto personalizado obrigatório | Exige configuração; sem recursos públicos |
| Indexa Br | [indexabr](https://indexabr.vercel.app) | Manifesto personalizado obrigatório | Exige configuração |
| BrasilRD | [brasilrd](https://brasil-rd-oficial.oniko.org/configure) | Manifesto personalizado obrigatório | JSON com recurso stream |
| Brazuca Torrents | [brazuca](https://94c8cb9f702d-brazuca-torrents.baby-beamup.club) | Chave TorBox ou manifesto HTTP personalizado | JSON com recurso stream |
| Torrentio | [torrentio](https://torrentio.strem.fun/providers=comando,bludv,micoleaodublado%7Clanguage=portuguese/manifest.json) | Chave TorBox ou manifesto HTTP personalizado | 403 nesta rede |
| Magneto | [magneto](https://magneto-jnv5.onrender.com/v1/configure) | Manifesto personalizado obrigatório | 503 |
| ProwJack | [prowjack](https://prowjack-delta.vercel.app/configure) | Manifesto personalizado obrigatório | Exige configuração |
| Pengu | [pengu](https://pengu.uk/configure) | Manifesto personalizado obrigatório | Timeout |
| Media Fusion | [mediafusion](https://mediafusion.elfhosted.com/app/configure) | Manifesto personalizado obrigatório | Timeout |
| ThePirateBay | [piratebay](https://thepiratebay-plus.strem.fun/manifest.json) | Chave TorBox ou manifesto HTTP personalizado | 403 nesta rede |
| Meteor | [meteor](https://meteorfortheweebs.midnightignite.me/configure) | Manifesto personalizado obrigatório | Timeout |
| Corsaro Viola | [corsaro](https://icv.stremio-italia.eu/configure) | Chave TorBox ou manifesto HTTP personalizado | JSON com recurso stream |
| Comet | [comet](https://comet.elfhosted.com/configure) | Manifesto personalizado obrigatório | Timeout |
| Orion | [orion](https://5a0d1888fa64-orion.baby-beamup.club/configure) | Manifesto personalizado obrigatório | Exige configuração |
| TorrentsDB | [torrentsdb](https://torrentsdb.com/configure) | Chave TorBox ou manifesto HTTP personalizado | JSON com recurso stream |
| Jackettio | [jackettio](https://jackettio.elfhosted.com/configure) | Manifesto personalizado obrigatório | Timeout |
| Pipe | [pipe](https://pipe.boringways.workers.dev) | Chave TorBox ou manifesto HTTP personalizado | JSON com recurso stream |
| Nexus | [nexus](https://nexuszen.vercel.app) | HTTP público habilitado | JSON com recurso stream |

IDs dos campos: `sourceEnabled_{id}` e `sourceManifest_{id}`. A URL personalizada substitui o manifesto público, e um botão explicitamente desativado prevalece. O limite total é de 64 manifestos deduplicados, incluindo fontes embutidas e extras. As configurações são individuais por fornecedor.

Nenhuma API key ou URL privada está neste catálogo. O TorBox direto do Kazuji não torna automaticamente compatíveis fontes de login obrigatório, fontes de outros debrid ou catálogos com IDs que não sejam os IMDb/TMDB suportados pelo agregador.
