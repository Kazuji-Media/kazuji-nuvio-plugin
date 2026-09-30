# TorBox no plugin JavaScript · 1.2.0

O Nuvio não fornece a credencial global de debrid para o runtime JS. O Kazuji recebe uma chave explícita no campo `torboxApiKey` de `SCRAPER_SETTINGS` e usa `fetch` diretamente; não depende da resolução de plugins pelo app nem de servidor Kazuji.

| Etapa | Contrato |
| --- | --- |
| Cache | POST `https://api.torbox.app/v1/api/torrents/checkcached?format=object&list_files=true`, JSON `{hashes:[...]}`, Authorization Bearer |
| Registrar item em cache | POST `/v1/api/torrents/createtorrent`, multipart textual: `magnet`, `add_only_if_cached=true`, `allow_zip=false`, `seed=3` |
| Arquivos | GET `/v1/api/torrents/mylist?id={id}&bypass_cache=true`, valida ID/hash e seleciona vídeo |
| Link HTTP | GET `/v1/api/torrents/requestdl?token={key}&torrent_id={id}&file_id={fileId}&zip_link=false&redirect=false&append_name=false`; usa `data` HTTPS, não devolve permalink com chave |

Fontes primárias: [documentação TorBox](https://www.postman.com/torbox/torbox-api/documentation/b6l9hbv/main-api?entity=request-29572726-3847e19a-0de7-4956-a072-4c4d41d0ff6c), [SDK oficial](https://github.com/TorBox-App/torbox-sdk-js/blob/main/documentation/services/TorrentsService.md). As respostas wire usam `torrent_id`, `short_name` e `file_id`; camelCase nos documentos do SDK corresponde aos modelos internos.

Comparado com o [cliente TorBox do Nuvio](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/debrid/DebridApiClients.kt). O [FetchBridge](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/network/FetchBridge.kt) aceita headers e body textual, permitindo multipart sem `FormData`.

Por busca/fornecedor, o resolvedor compartilha cache, registro e links entre hashes duplicados. Limita registros a 4 por padrão (máximo 12) e operações de registro/link a duas simultâneas. Filtra qualidade/idioma/codecs antes da API. Amostras/trailers são excluídos; filmes usam o maior vídeo elegível se a fonte não identificar o arquivo. Séries exigem identificação `SxxEyy` ou `NxM`; não escolhe silenciosamente o maior arquivo de um pacote. Anime sem esses padrões pode não retornar resultado.

401/403/429 desativam novas operações TorBox naquela busca e preservam HTTP das fontes. Não há polling, fila sem cache, Usenet/hosters ou credenciais de outros serviços. O resolvedor não publica chaves e não copia headers do indexador para a URL assinada. `requestdl` inclui a chave na query por exigência da API; logs internos do Nuvio podem exibir URLs de fetch. Logs próprios contêm estatísticas numéricas/aviso genérico.

Verificação: fluxo simulado completo em VM sem imports Node, body multipart, deduplicação, autenticação/cache falhos, filtros e seleção de episódio/arquivo. Não houve conta TorBox real nem reprodução no aparelho. Os prazos dependem dos limites nativos descritos em `NUVIO.md`.
