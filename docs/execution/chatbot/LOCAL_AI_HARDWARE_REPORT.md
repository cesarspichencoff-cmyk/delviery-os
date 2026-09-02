# Hardware local — prova de desenvolvimento

Coleta somente leitura em 2026-07-28. Este relatório descreve o computador de
desenvolvimento de César e **não prova o computador do restaurante**.

| Item | Resultado |
|---|---|
| Sistema | Windows 11 Pro 64 bits · 10.0.22631 |
| CPU | AMD Ryzen 7 2700X · 8 núcleos · 16 threads |
| Instruções | SSE4.2, AVX, AVX2 e FMA disponíveis |
| RAM | 34.292.985.856 B totais; 22.192.832.512 B livres na coleta |
| GPU | NVIDIA GeForce GTX 1060 6GB · compute capability 6.1 |
| VRAM | 6.144 MiB reportados por `nvidia-smi` |
| Driver | 581.80 |
| Disco C: livre | 260.059.336.704 B |
| Node | v24.18.0 |
| llama.cpp / Ollama / Docker | não instalados |

Classificação deste computador: **intermediário**. Pode homologar Qwen3-4B
Q4_K_M e o fallback 1.7B; gpt-oss-20b deve ser tratado como avançado e só será
baixado após doctor específico demonstrar memória, disco e latência aceitáveis.

O doctor instalável repetirá a coleta no restaurante e poderá classificar:

- `incompatible`: Windows/arquitetura/instruções/RAM/disco insuficientes;
- `basic`: CPU AVX2, 8 GB RAM e espaço para fallback;
- `intermediate`: 16 GB RAM e espaço para o 4B, com GPU opcional;
- `advanced`: 32 GB RAM e aceleração/margem para o candidato de 20B.

Temperatura, energia e acesso ao endpoint não estavam disponíveis de forma
portável nesta coleta; permanecem `unknown`, nunca são inventados.

