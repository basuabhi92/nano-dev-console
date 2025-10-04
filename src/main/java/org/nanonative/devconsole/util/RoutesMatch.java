package org.nanonative.devconsole.util;

sealed public interface RoutesMatch permits DevInfo, DevLogs, DevConfig, DevEvents, DevHtml, DevUi, DevService, NoMatch {}
