import { faComments } from '@fortawesome/free-solid-svg-icons';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { createElement, type FC } from 'react';
import { Extension, type ExtensionContext } from 'shared';
import './app.css';
import ChatWidget from './ChatWidget.tsx';
import ConfigurationPage from './ConfigurationPage.tsx';
import { getExtTranslations } from './translations.ts';

class CalagopusChatExtension extends Extension {
  public cardConfigurationPage: FC | null = ConfigurationPage;
  public cardIcon = createElement(FontAwesomeIcon, { icon: faComments });

  public initialize(ctx: ExtensionContext): void {
    ctx.extensionRegistry.pages.global.appendComponent(ChatWidget);
    ctx.extensionRegistry.routes.addAdminRoute({
      name: () => getExtTranslations().t('settings.sidebarTitle', {}),
      path: '/calagopus-chat',
      icon: faComments,
      element: ConfigurationPage,
      permission: 'extensions.manage',
      category: 'system',
      exact: true,
    });
  }
}

export default new CalagopusChatExtension();
