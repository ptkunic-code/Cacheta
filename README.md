# Cacheta

Cacheta para jogar no celular, contra o computador ou online com os amigos.

**Jogar:** https://ptkunic-code.github.io/Cacheta/

## Instalar no celular
- **iPhone:** abra o link no Safari → botão Compartilhar → **Adicionar à Tela de Início**.
- **Android:** abra o link no Chrome → menu ⋮ → **Instalar app** (ou "Adicionar à tela inicial").

Depois de instalado, abre em tela cheia e funciona sem internet.

## Regras que o dono da mesa escolhe
- Contra 1 a 3 adversários do computador (Fácil ou Esperto)
- 1 a 3 baralhos e 0 a 8 curingas (carta especial que substitui qualquer carta)
- Como pode bater: só com 10 (padrão), 9 ou 10, ou só com 9
- Batida de 10 vale 2 pontos (opcional)
- Tempo entre jogadas (janela para bater fora da vez) e tempo para jogar (5 a 30 s, padrão 15 s)
- Pontos para ganhar a mesa: 3, 5, 7, 10 ou sem limite
- Dicas na mão, 6 temas de mesa

Quem aperta Bater sem fechar só pode bater comprando do monte até o fim da rodada. Quem fica a uma carta de bater é anunciado como **pifado**.

## Online com amigos
Em **Nova mesa → Online com amigos**, você cria uma sala, escolhe as regras e manda o link (ou o código de 4 letras) no WhatsApp. Jogam de 2 a 4 pessoas de verdade, com as mesmas regras do modo contra o computador.

- O **servidor** (`server/`) embaralha, confere cada jogada e manda para cada jogador só a própria mão. Ninguém vê as cartas dos outros.
- Quem cai ou recarrega a página **volta para a mesma vaga**. Enquanto está fora, o servidor joga por ele quando o tempo acaba.
- Emojis entre os jogadores já funcionam. A **voz em conferência** ainda não está disponível online.

### Rodar o servidor no seu computador
```bash
cd server
npm install
npm start
```
Abra http://localhost:3000 (o servidor também entrega o jogo). Para testar com 2 jogadores, abra duas abas. `npm test` joga uma partida automática com 3 clientes.

### Publicar o servidor (gratuito)
O site continua no GitHub Pages. O servidor precisa de um lugar próprio:

1. No [Render](https://render.com), crie um **Blueprint** apontando para este repositório (ele lê o `render.yaml`) ou um **Web Service** com *Root Directory* `server`, build `npm install` e start `npm start`.
2. Copie o endereço que o Render der (ex.: `https://cacheta-online.onrender.com`) e coloque em `PROD_SERVER` no começo do bloco "online" do `index.html`, trocando `https` por `wss`:
   `const PROD_SERVER='wss://cacheta-online.onrender.com';`
3. Publique de novo e aumente a versão do cache em `sw.js`.

No plano gratuito o servidor dorme depois de uns minutos parado. A primeira pessoa a abrir espera até 1 minuto. Um monitor gratuito (UptimeRobot) chamando `/health` a cada 5 minutos evita isso.
