# TorBox nos add-ons · 1.2.1

Preencha **TorBox · API key** nas configurações do fornecedor de qualidade. O plugin prepara automaticamente os add-ons compatíveis, consulta seus recursos `stream` e retorna apenas links HTTP(S). Não exige servidor Kazuji, manifesto manual ou configuração individual de add-ons. O Nuvio persiste settings por fornecedor; a chave de debrid global do app não é disponibilizada ao JavaScript.

| Etapa | Comportamento |
| --- | --- |
| Sem chave | Consulta oito fontes HTTP públicas |
| Com chave | Acrescenta onze add-ons com o formato TorBox de cada serviço |
| Configuração na URL | Gera o segmento de configuração exigido pelo add-on; JSON codificado em UTF-8 e Base64/Base64url quando aplicável |
| Configuração no servidor | Indexa Br, ProwJack e Media Fusion recebem POST HTTPS e devolvem uma referência opaca para o manifesto |
| Busca | Usa a URL configurada também no recurso de streams; respeita tipos e prefixos do manifesto |
| Seleção | Mantém a qualidade do fornecedor e as preferências de áudio/compatibilidade |
| Torrent ou erro de esquema | Descarta hash, magnet, `.torrent`, `clientResolve` sem HTTP e `about:error` |
| Fonte indisponível | Falha isoladamente; preserva HTTP das outras fontes e não tenta resolver hashes |

O antigo `src/torbox.js` foi removido. O plugin não consulta `checkcached`, não cria torrents e não chama `requestdl` diretamente. Cache e geração de URLs são feitos pelos add-ons/TorBox. Quando existe opção compatível, solicita resultados em cache/HTTP e desativa P2P. A qualidade informada e a disponibilidade continuam dependendo da fonte; não há HEAD, amostra ou reprodução durante a busca.

A chave é enviada aos serviços listados em [SOURCES.md](SOURCES.md), inclusive em URLs de configuração quando o protocolo exige. Configurações geradas por POST podem ser armazenadas nos servidores desses add-ons. Referências válidas são reutilizadas por até dez minutos no mesmo runtime, separadas por chave e limitadas a dezesseis entradas. Respostas com erros, URLs externas, travessia de caminho ou referências inválidas são recusadas. Não há fallback para torrents, login automático, senha extra ou polling.

O Kazuji não registra chaves ou URLs configuradas nas suas estatísticas. O campo do Nuvio é textual e os logs de requisições do aplicativo podem conter URLs de configuração. Manifestos e bundles publicados não contêm credenciais. Streams retornados preservam os headers de reprodução necessários fornecidos pelo add-on.

As configurações antigas de manifestos e limites do resolvedor são ignoradas. A versão 1.2.1 foi validada com o bundle em uma VM sem imports Node: configuração automática, POST, troca de credenciais, deduplicação, filtros por qualidade, falhas de autenticação e descarte de torrents/`about:error`. Sete manifestos configurados responderam com recurso stream em consultas GET usando uma chave fictícia. Isso não comprova autenticação, cache ou reprodução. Não houve teste com conta TorBox real nem no aparelho Nuvio.

O relato `Erro about:error` não identifica sozinho a causa original no aplicativo. Esse esquema não é retornado pelo filtro HTTP. Erros de reprodução, redirecionamentos e vídeos de aviso com URL HTTP precisam de diagnóstico no aparelho; os limites de runtime permanecem descritos em [NUVIO.md](NUVIO.md).
