import vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient/node';
import { generateGrammarCommandHandler } from './commands/generateGrammarCommand';
import { registerLanguageConfigurations } from './languages';
import { initializeLanguageClient } from './client';
import { join } from 'path';
import {
  setVirtualContents,
  registerVeturTextDocumentProviders,
  generateShowVirtualFileCommand
} from './commands/virtualFileCommand';
import { getGlobalSnippetDir } from './userSnippetDir';
import { generateOpenUserScaffoldSnippetFolderCommand } from './commands/openUserScaffoldSnippetFolderCommand';
import { generateDoctorCommand } from './commands/doctorCommand';

export async function activate(context: vscode.ExtensionContext) {
  const isInsiders = vscode.env.appName.includes('Insiders');
  const globalSnippetDir = getGlobalSnippetDir(isInsiders);

  /**
   * Virtual file display command for debugging template interpolation
   */
  context.subscriptions.push(await registerVeturTextDocumentProviders());

  /**
   * Custom Block Grammar generation command
   */
  context.subscriptions.push(
    vscode.commands.registerCommand('vetur.generateGrammar', generateGrammarCommandHandler(context.extensionPath))
  );

  /**
   * Open custom snippet folder
   */
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'vetur.openUserScaffoldSnippetFolder',
      generateOpenUserScaffoldSnippetFolderCommand(globalSnippetDir)
    )
  );

  registerLanguageConfigurations();

  /**
   * Vue Language Server Initialization
   */

  const serverModule = context.asAbsolutePath(join('server', 'dist', 'vueServerMain.js'));
  const client = initializeLanguageClient(serverModule, globalSnippetDir);
  context.subscriptions.push(client.start());

  const promise = client
    .onReady()
    .then(() => {
      registerCustomClientNotificationHandlers(client);
      registerCustomLSPCommands(context, client);
      registerRestartVLSCommand(context, client);

      registerVueLanguageConfiguration();
    })
    .catch((e: Error) => {
      console.error(e.stack);
      console.log('Client initialization failed');
    });

  return displayInitProgress(promise);
}

async function displayInitProgress(promise: Promise<void>) {
  return vscode.window.withProgress(
    {
      title: 'Vetur initialization',
      location: vscode.ProgressLocation.Window
    },
    () => promise
  );
}

function registerRestartVLSCommand(context: vscode.ExtensionContext, client: LanguageClient) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vetur.restartVLS', () =>
      displayInitProgress(
        client
          .stop()
          .then(() => client.start())
          .then(() => client.onReady())
      )
    )
  );
}

function registerCustomClientNotificationHandlers(client: LanguageClient) {
  client.onNotification('$/openWebsite', (url: string) => {
    vscode.env.openExternal(vscode.Uri.parse(url));
  });
  client.onNotification('$/showVirtualFile', (virtualFileSource: string, prettySourceMap: string) => {
    setVirtualContents(virtualFileSource, prettySourceMap);
  });
}

function registerCustomLSPCommands(context: vscode.ExtensionContext, client: LanguageClient) {
  context.subscriptions.push(
    vscode.commands.registerCommand('vetur.showCorrespondingVirtualFile', generateShowVirtualFileCommand(client)),
    vscode.commands.registerCommand('vetur.showOutputChannel', () => client.outputChannel.show()),
    vscode.commands.registerCommand('vetur.showDoctorInfo', generateDoctorCommand(client))
  );
}

function registerVueLanguageConfiguration() {
  vscode.languages.setLanguageConfiguration('vue', {
    /* tslint:disable:max-line-length */
    // adopted from https://github.com/microsoft/vscode/blob/6a1c7a5097d048365ff4fe6335f7f98fde560ea4/extensions/typescript-language-features/src/languageFeatures/languageConfiguration.ts#L20
    wordPattern: /(-?\d*\.\d\w*)|([^\`\~\!\@\%\^\&\*\(\)\-\=\+\[\{\]\}\\\|\;\:\'\"\,\.\<\>\/\?\s]+)/
  });
}
