import { faComments } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { createElement, type FC } from 'react';
import { Extension, type ExtensionContext } from 'shared';
import ChatWidget from './ChatWidget.tsx';
import ConfigurationPage from './ConfigurationPage.tsx';

class CalagopusChatExtension extends Extension {
  public cardConfigurationPage: FC | null = ConfigurationPage;
  public cardIcon = createElement(FontAwesomeIcon, { icon: faComments });

  public initialize(ctx: ExtensionContext): void {
    ctx.extensionRegistry.pages.global.appendComponent(ChatWidget);
  }
}

export default new CalagopusChatExtension();
