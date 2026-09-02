# Latência e hardware — Mudança 005B

## Configuração comum

- CPU: AMD Ryzen 7 2700X, 8 núcleos e 16 threads;
- RAM total: 34.292.985.856 bytes;
- GPU instalada: GTX 1060 6 GB;
- execução dos candidatos: CPU, `gpu_layers=0`, portanto VRAM não utilizada;
- contexto: 8.192;
- paralelismo do servidor: 1;
- runtime: llama.cpp b10172;
- thinking: desligado.

## Métricas

| Modelo / papel | carga | p50 | p95 | máximo | fallback |
|---|---:|---:|---:|---:|---:|
| Gemma 4 E4B Writer | 5,62 s | 4,86 s | 10,38 s | 15,96 s | 0/292 |
| Gemma 4 E4B Director | mesma sessão | 28,59 s | 30,47 s | 30,47 s | 1/8 |
| Qwen3.5 4B Writer | 4,57 s | 4,60 s | 9,70 s | 12,49 s | 3/292 |
| Qwen3.5 4B Director | 4,19 s na repetição final | 22,61 s | 26,83 s | 26,83 s | 0/8 |

## Memória e estabilidade

- Gemma E4B: amostras estáveis entre aproximadamente 5,6 e 6,15 GiB de
  working set durante o corpus;
- Qwen3.5: amostras entre aproximadamente 5,29 e 7,17 GiB, oscilando sem
  crescimento monotônico;
- campanha Writer Gemma: cerca de 29,3 minutos, código de saída zero;
- campanha Writer Qwen: 27,1 minutos, código de saída zero;
- zero crash, travamento, paginação extrema observada ou processo residual;
- Doctor pós-Qwen: 18.768.945.152 bytes disponíveis e 42 °C;
- não houve série térmica contínua; a medição pós-execução não substitui Doctor
  do computador do restaurante.

## Gate

O Writer dos dois candidatos ficou dentro da meta preferencial de p95 inferior
a 12 s e máximo inferior a 25 s. O Director dos dois ficou acima de 25 s no
máximo e acima de 15 s no p95, portanto não operacional neste hardware.
