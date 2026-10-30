# Roleta da Paixão ❤️

Jogo privado para Alberto e Bernardete.

## Incluído
- Sala privada com código e convite por link
- Limite de dois jogadores
- 8 categorias e banco inicial de 1.500 desafios
- Desafios personalizados por sala
- Anti-repetição por sala: cada desafio é marcado como usado e não volta a sair até reiniciar o ciclo
- Histórico persistente em PostgreSQL
- Pontuação, chat e sinalização para chamada de vídeo WebRTC

## Publicação no Render
1. Crie uma base de dados PostgreSQL no Render.
2. Copie a **Internal Database URL**.
3. Crie um Web Service a partir do repositório GitHub.
4. Build Command: `npm install`
5. Start Command: `npm start`
6. Adicione a variável `DATABASE_URL` com a URL da base de dados.
7. Faça deploy.

## Teste local
Defina `DATABASE_URL`, execute `npm install` e `npm start`, e abra `http://localhost:3000`.

## Notas
- O histórico e os desafios utilizados ficam guardados por sala.
- Reiniciar o ciclo limpa apenas os desafios usados, não apaga o histórico.
- A interface mostra os 50 registos mais recentes.
- A chamada usa WebRTC e STUN público; algumas redes podem precisar de TURN para ligações fiáveis.
- Antes de disponibilizar publicamente, recomenda-se adicionar autenticação reforçada, proteção contra abuso e revisão de privacidade.
