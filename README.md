# Checklist de Pré-Instalação ECTAS

- **Equipe de campo:** https://checklist-ectas.github.io/campo
- **Supervisor:** https://checklist-ectas.github.io/supervisor

O **supervisor** cadastra os técnicos (cada um com um código pessoal) e as obras, escolhe o técnico responsável de cada obra e envia o link para ele. Cada técnico só vê e confere as obras liberadas para ele. A **equipe de campo** só confere: cada item é marcado como Conferido ou Não conferido, com observação e foto opcionais.
No painel, o supervisor acompanha as obras, a liberação para mobilização, os itens não conferidos, as fotos e os resultados mês a mês com o total do ano.
Com a central ligada, ele lê a planilha da central (pede a senha do supervisor). Sem a central, importa os arquivos Excel exportados pelo app de campo.

Checklist de pré-instalação preenchido no celular pela equipe de campo: status de cada item, responsável, prazos, observações e fotos.
Mostra se a obra está **LIBERADA** para mobilização (todos os itens da etapa Mobilização concluídos ou não aplicáveis).
Envia o checklist da obra em **PDF** pelo WhatsApp e exporta todas as obras em **Excel** no formato da planilha de controle (abas OBRAS e REGISTRO).

Funciona sem internet: os dados ficam no celular e são enviados à central quando houver conexão.
Instale pelo Chrome (Android: Instalar) ou Safari (iPhone: Compartilhar > Adicionar à Tela de Início).

## Central (planilha Google)
A central é um Google Apps Script (`central-Code.gs.txt`) que guarda tudo na planilha
"Checklist de Pré-Instalação ECTAS - Base" e as fotos no Google Drive.

1. Em script.google.com, crie um projeto novo e cole o conteúdo de `central-Code.gs.txt`.
2. Troque `SENHA_SUPERVISOR` (senha do painel). Os técnicos e os códigos pessoais são cadastrados pelo painel do supervisor.
3. Rode `configurar` e autorize.
4. Implantar > Nova implantação > App da Web · Executar como: Eu · Acesso: Qualquer pessoa.
5. Cole o URL em `config.js` (`window.CENTRAL={url:"..."}`) e publique.

A lista padrão de itens fica na aba ITENS da planilha.
Nenhum dado de obra ou foto fica neste repositório.
