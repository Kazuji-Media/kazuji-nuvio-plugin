# Auditoria do contrato Nuvio

Revisão em 29/09/2026, com fontes oficiais fixadas em commits para permitir reprodução:

- NuvioMobile `cmp-rewrite`: `c1065d0a2a717d7dba445257f064f3fb8d1b30a3`.
- NuvioTV `dev`: `fa6614384e23ff5808bf39c53dd3fa602055c54e`.

As builds distribuídas podem diferir dessas branches. Não é uma declaração de compatibilidade com todos os clientes ou builds antigos.

## Entradas do plugin JS no Mobile Full

| Entrada | Significado |
| --- | --- |
| `getStreams(tmdbId, mediaType, season, episode)` | Única função de busca chamada pelo app |
| `tmdbId` | ID passado como string; a normalização do app pode manter IMDb ou remover prefixo TMDB |
| `mediaType` | Filme/série; Kazuji aceita `movie`, `tv` e `series` |
| `season` / `episode` | Números de episódio; ausentes para filme |
| `globalThis.SCRAPER_SETTINGS` | Configuração salva para aquele scraper |
| `globalThis.SCRAPER_ID` | Identificador do scraper |
| `globalThis.TMDB_API_KEY` | Chave efetiva de TMDB fornecida pelo app |

O app **não passa** título, classificação, idioma do celular/preferido global, catálogo completo, histórico, progresso de reprodução, conta/sessão TorBox ou callbacks de resultados incrementais para essa chamada. Kazuji consulta TMDB para IDs, título, ano, diretor/criadores, produtoras, língua original e classificação; o idioma principal é uma configuração manual.

Fontes:

- [Chamada e globals — JsBindings.kt](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/js/JsBindings.kt#L4-L63)
- [Argumentos e registro de bridges — PluginRuntime.kt](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt#L124-L170)
- [HostFunctions e chave TMDB](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/host/HostFunctions.kt)
- [Normalização de IDs](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginContentIds.kt)

## Configurações

O manifesto de repositório usa `scrapers`, com `hasSettings: true`. O módulo exporta `onSettings()`; o app chama essa função e renderiza campos `header`, `info`, `text`, `select` e `toggle`. Valores são persistidos e injetados como `SCRAPER_SETTINGS`.

Não há campo `multiselect` nesse renderer. A seleção múltipla de qualidades do Kazuji usa cinco campos `toggle` independentes, convertidos pelo adaptador em uma lista de resoluções. Fontes continuam sendo cadastradas dinamicamente pelo campo de manifestos. A página web usa checkboxes para as mesmas qualidades.

- [Modelo do manifesto](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/plugins/PluginModels.kt#L16-L45)
- [Renderização/persistência das configurações](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/PluginSettingsDialog.kt)

O renderer revisado lê `isPassword`, mas não o aplica como transformação de senha ao input. Kazuji não exige digitar chave TorBox nessa interface; prefira a chave TMDB já fornecida pelo app.

## Saídas do plugin JS

`getStreams` devolve uma Promise com um array. O parser exige `url` não vazia (string ou objeto com `url`), inclusive para resultados que contenham `infoHash`.

| Campo | Tratamento no Mobile |
| --- | --- |
| `name`, `title` | Rótulos do resultado |
| `quality`, `size`, `language` | Informações exibidas na descrição |
| `provider`, `type` | Parser aceita; a conversão usa o scraper como fonte e normaliza `type` |
| `infoHash` | Preservado, mas não libera a rota TorBox para plugins |
| `seeders`, `peers` | Parser aceita; não são usados pela conversão de stream revisada |
| `headers` | Preservados como proxyHeaders.request; Range é removido na conversão |
| `subtitles` | URLs, language, name e headers externos preservados |
| `fileIdx`, `sources`, `behaviorHints`, `clientResolve` | Não são preservados por esse parser/conversor nativo |

- [Parser de resultados](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt#L192-L251)
- [Conversão de resultados e grupos plugin/addon](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamFetchSupport.kt)

Por isso o adaptador JS retorna somente URLs diretas com os campos que o Nuvio preserva.

### Rótulo e ordenação na tela

No Mobile, a conversão usa `name` (ou `title` se `name` estiver ausente) como rótulo e monta a descrição com quality/size/language. Assim, colocar créditos apenas em `title` quando `name` existe pode ocultá-los. Kazuji coloca as três linhas no `name` nativo. O `Text` do rótulo em StreamCard não impõe `maxLines` nessa revisão, mas não houve verificação visual no aparelho.

`StreamFetchSupport.sortedForGroupedDisplay` ordena por sourceName, streamLabel e streamSubtitle. Essa ordenação alfabética pode sobrescrever a prioridade devolvida pelo plugin. Kazuji ordena seus resultados por resolução e áudio antes de retornar, sem inserir caracteres invisíveis no rótulo; não promete forçar a ordem visual do app. Para garantí-la preservando título/ano no começo, o Nuvio precisaria respeitar a ordem da fonte ou receber um campo explícito de prioridade.

- [Conversão e ordenação — StreamFetchSupport.kt](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamFetchSupport.kt)
- [Renderização — StreamCard.kt](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamCard.kt)

## Metadados Fusion e tamanho

O Kazuji 1.1.4 inclui termos técnicos reconhecíveis no rótulo/descrição dos dois adaptadores. A conversão JS mantém `name` e monta a descrição com quality/size/language; `size` não é convertido em `behaviorHints.videoSize`. O HTTP preserva `behaviorHints`, preenche `filename` somente com um nome real recebido e fornece `videoSize` numérico quando conhecido. O pacote de emblemas precisa ser importado nas configurações globais pelo usuário.

- [Regras e candidatos de correspondência Fusion](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamBadgeRules.kt)
- [Imagens e emblema de tamanho](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamBadgeChip.kt)

## TorBox conectado ao app

O registro de APIs do plugin JS inclui fetch, URL, crypto, DOM, WASM e funções básicas; **não inclui uma API de TorBox nem de credenciais debrid**.

No **Mobile**, `DirectDebridPlaybackResolver.shouldResolveToPlayableStream` exige `stream.isInstalledAddonStream`, e essa propriedade testa se o grupo começa com `addon:`. Grupos de plugin começam com `plugin:` ou `plugin-repo:`.

Para este Kazuji e para TorBox nativo no Mobile, instale a versão **add-on HTTP**. O app recebe os campos completos do recurso stream, reconhece o grupo addon, verifica cache e resolve usando o resolvedor ativo.

- [Guardas e resolução TorBox — DirectDebridResolver.kt](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/debrid/DirectDebridResolver.kt#L112-L129)
- [Resolução local e credencial ativa](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/debrid/DirectDebridResolver.kt#L201-L295)
- [Identificação de addon, torrent e URL reproduzível](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/streams/StreamModels.kt#L43-L113)
- [Verificação de cache TorBox](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/debrid/LocalDebridService.kt)

Kazuji não consegue medir a velocidade de um torrent ainda não resolvido pela conta do app. Essas alternativas são marcadas como sem teste. Não existe handshake para detectar a conta ativa no servidor Kazuji.

No **TV**, a guarda de `DirectDebridResolver` usa a necessidade de resolução local e a credencial ativa, sem a exclusão por origem `addon:` do Mobile. Pelo código revisado, um plugin pode entregar uma URL torrent/magnet com infoHash e ser elegível para resolução TorBox. Isso não torna este agregador JS compatível com o runtime bloqueante do TV; o Kazuji nativo atual só retorna HTTP e precisa de timers assíncronos.

O motor P2P do app também é separado da rota TorBox e reconhece hashes/URLs torrent conforme build e configuração; não deve ser confundido com suporte à conta TorBox. Nesta implementação Kazuji, torrents são preservados apenas no adaptador HTTP. Não há bridge para o plugin iniciar um torrent e medir sua velocidade antes de devolvê-lo.

- [Guarda de debrid TV](https://github.com/NuvioMedia/NuvioTV/blob/fa6614384e23ff5808bf39c53dd3fa602055c54e/app/src/main/java/com/nuvio/tv/core/debrid/DirectDebridResolver.kt)

## Rede, prazos e NuvioTV

Mobile Full: fetch é uma função nativa assíncrona e timers usam coroutine delay. `arrayBuffer()` expõe os bytes recebidos. O bridge recebe até 1 MiB por resposta, não permite ajustar esse limite pelo argumento fetch e não implementa cancelamento via signal. O runtime possui limite global próprio de 60 s; o prazo menor do motor Kazuji não é garantia do tempo de retorno ao app.

Revisão adicional nas tags: 0.5.1-beta não tem timers nem arrayBuffer; 0.5.2-beta e 0.5.3-beta têm arrayBuffer, mas não timers; 0.5.4-beta tem ambos. O plugin requer a 0.5.4-beta ou contrato equivalente. A presença dessas APIs permite executar o motor, mas não corrige a falta de cancelamento físico.

**Jobs nativos pendentes:** Nuvio 0.5.4-beta usa QuickJS-kt 1.0.15. `QuickJs.awaitEvaluateResult` espera o resultado e todos os jobs nativos ativos da sessão antes de concluir `evaluate`. O runtime Nuvio aguarda esse evaluate antes de consumir o resultado capturado. `clearTimeout` só remove o callback de uma tabela JavaScript; não cancela o sleep nativo. `fetch(signal)` também não cancela o HTTP. O cliente Android tem timeouts de 60 s e o runtime inteiro tem limite de 60 s. Assim, Promise.race/AbortController no plugin não bastam para entregar resultados rapidamente quando uma requisição nativa fica presa.

No diagnóstico reportado pelo usuário, a busca mostrou fontes após desativar `probeMode` e habilitar `allowUnverified`; isso isola as requisições de amostra como causa do travamento observado. Desde o Kazuji 1.1.3, testes de vídeo (amostra e HEAD) foram removidos do adaptador nativo: `probeMode` fica sempre `off` e `allowUnverified` sempre `true`, inclusive com valores antigos em presets, configurações salvas ou JSON avançado. Esses controles não aparecem mais em `onSettings()`. A ordenação usa velocidade declarada pela fonte quando disponível. Não prova a velocidade nem a reprodução dos links. Corrigir o prazo de ponta a ponta exige cancelamento/timeout no bridge ou encerramento das tarefas nativas assim que o resultado é capturado, com gestão segura do runtime.

- [Runtime na release 0.5.4-beta](https://github.com/NuvioMedia/NuvioMobile/blob/0.5.4-beta/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/PluginRuntime.kt)
- [Timers na release 0.5.4-beta](https://github.com/NuvioMedia/NuvioMobile/blob/0.5.4-beta/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/js/JsBindings.kt)
- [HTTP Android na release 0.5.4-beta](https://github.com/NuvioMedia/NuvioMobile/blob/0.5.4-beta/composeApp/src/androidMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.android.kt)
- [QuickJS-kt 1.0.15: awaitEvaluateResult](https://github.com/dokar3/quickjs-kt/blob/v1.0.15/quickjs/src/jniMain/kotlin/com/dokar/quickjs/QuickJs.jni.kt)

A polyfill URL do Mobile não sincroniza mutações de pathname/search com href. Kazuji monta as URLs do protocolo e resolve caminhos HLS explicitamente, sem depender desse comportamento. O teste do bundle não injeta a classe URL do Node.

- [Timers e fetch — JsBindings.kt](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/js/JsBindings.kt#L65-L254)
- [Bridge de rede](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/fullCommonMain/kotlin/com/nuvio/app/features/plugins/runtime/network/FetchBridge.kt)
- [Limite de corpo de resposta](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/commonMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.kt#L24-L48)
- [Leitura limitada/cancelamento HTTP Android](https://github.com/NuvioMedia/NuvioMobile/blob/c1065d0a2a717d7dba445257f064f3fb8d1b30a3/composeApp/src/androidMain/kotlin/com/nuvio/app/features/addons/AddonPlatform.android.kt#L265-L335)

NuvioTV `dev`: `__native_fetch` é registrado com `function`, e a polyfill chama essa função de modo síncrono. Não há implementação setTimeout/clearTimeout nesse runtime revisado. O modelo de scraper não anuncia `hasSettings` nem há chamada `onSettings` no runtime. Ainda há `SCRAPER_SETTINGS` para configurações geridas pelo app, mas isso não equivale ao formulário genérico do Mobile.

- [Runtime TV](https://github.com/NuvioMedia/NuvioTV/blob/fa6614384e23ff5808bf39c53dd3fa602055c54e/app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt#L287-L315)
- [Fetch TV](https://github.com/NuvioMedia/NuvioTV/blob/fa6614384e23ff5808bf39c53dd3fa602055c54e/app/src/full/java/com/nuvio/tv/core/plugin/PluginRuntime.kt#L765-L825)
- [Modelo de plugin TV](https://github.com/NuvioMedia/NuvioTV/blob/fa6614384e23ff5808bf39c53dd3fa602055c54e/app/src/main/java/com/nuvio/tv/domain/model/Plugin.kt)
- [Resolvedor TorBox TV](https://github.com/NuvioMedia/NuvioTV/blob/fa6614384e23ff5808bf39c53dd3fa602055c54e/app/src/main/java/com/nuvio/tv/core/debrid/TorboxDirectDebridResolver.kt)

Consequência: Kazuji JS requer o runtime assíncrono do Mobile Full; use a versão HTTP no TV. Não adicionamos timers falsos ou busy-wait: não resolveriam fetch bloqueante nem paralelismo.

## Integrações e opções extras

| Opção | Estado | Observação |
| --- | --- | --- |
| Legendas embutidas nas respostas | Implementada | Preserva URL/idioma/headers |
| Headers de reprodução | Implementada | Referer, User-Agent e outros headers de fonte |
| TMDB do app | Implementada no JS | IDs, título/ano, créditos, língua original e classificação; servidor usa chave própria |
| `fileIdx` e trackers | Preservados no HTTP | Ajuda a selecionar arquivo/episódio |
| `bingeGroup` | Preservado no HTTP | Pode auxiliar continuidade de série conforme suporte do cliente |
| `filename`, `videoHash`, `videoSize` | Preservados no HTTP | Podem auxiliar identificação para legendas |
| `clientResolve` | Preservado no HTTP | Delega formatos suportados pelo Nuvio; servidor não autentica debrid |
| Codec/HDR/Dolby Vision | Implementada | Filtros configuráveis por informações declaradas; não comprovam codec real/capacidade do aparelho |
| Quantidade por qualidade/idioma | Implementada | Uma ou várias por grupo; ou todas as válidas dentro dos prazos/orçamentos |
| Tamanho máximo de arquivo | Ampliação possível | Não implementado |
| API independente de legendas | Ampliação possível | Consultar recurso `subtitles` dos add-ons; não implementado |
| Catálogos agregados | Ampliação possível | Novo recurso `catalog` com colisões/IDs; não implementado |
| Resultados incrementais por qualidade | Exige mudança do contrato ou múltiplos scrapers | Um getStreams devolve uma única lista |
| Probing após resolução com TorBox do app | Exige bridge ou alteração no Nuvio | A conta/URL resolvida não é exposta ao JS |
| Preferências globais, histórico e progresso | Exige API adicional do Nuvio | Não são entradas deste contrato |

O adaptador HTTP preserva campos já fornecidos pela fonte; isso não implica que todo cliente interprete todos os campos. O agregador não apresenta externalUrl de páginas ou IDs YouTube como se fossem vídeos diretos testados.
