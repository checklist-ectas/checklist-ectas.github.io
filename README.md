# Checklist de Pré-Instalação ECTAS

App: **https://checklist-ectas.github.io**

Checklist de pré-instalação preenchido no celular pela equipe de campo: status de cada item, responsável, prazos, observações e fotos.
Mostra se a obra está **LIBERADA** para mobilização (todos os itens da etapa Mobilização concluídos ou não aplicáveis).
Envia o checklist da obra em **PDF** pelo WhatsApp e exporta todas as obras em **Excel** no formato da planilha de controle (abas OBRAS e REGISTRO).

Funciona sem internet: os dados ficam no celular e são enviados à central quando houver conexão.
Instale pelo Chrome (Android: Instalar) ou Safari (iPhone: Compartilhar > Adicionar à Tela de Início).

## Central (planilha Google)
A central é um Google Apps Script (`central-Code.gs.txt`) que guarda tudo na planilha
"Checklist de Pré-Instalação ECTAS - Base" e as fotos no Google Drive.

1. Em script.google.com, crie um projeto novo e cole o conteúdo de `central-Code.gs.txt`.
2. Troque `CODIGO_EQUIPE` pelo código que a equipe vai usar.
3. Rode `configurar` e autorize.
4. Implantar > Nova implantação > App da Web · Executar como: Eu · Acesso: Qualquer pessoa.
5. Cole o URL em `config.js` (`window.CENTRAL={url:"..."}`) e publique.

A lista padrão de itens fica na aba ITENS da planilha.
Nenhum dado de obra ou foto fica neste repositório.
