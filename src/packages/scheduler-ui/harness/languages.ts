import { defaultSchedulerStrings } from '../src/stringResources';
import { germanStrings } from './germanStrings';
import { frenchStrings } from './frenchStrings';
import { spanishStrings } from './spanishStrings';
import { portugueseStrings } from './portugueseStrings';
import { brazilianPortugueseStrings } from './brazilianPortugueseStrings';
import { dutchStrings } from './dutchStrings';
import { italianStrings } from './italianStrings';

export const schedulerLanguages = {
  en: { name: 'English', strings: defaultSchedulerStrings },
  de: { name: 'Deutsch', strings: germanStrings },
  fr: { name: 'Français', strings: frenchStrings },
  es: { name: 'Español', strings: spanishStrings },
  pt: { name: 'Português (Portugal)', strings: portugueseStrings },
  'pt-BR': { name: 'Português (Brasil)', strings: brazilianPortugueseStrings },
  nl: { name: 'Nederlands', strings: dutchStrings },
  it: { name: 'Italiano', strings: italianStrings },
};
export type SchedulerLocale = keyof typeof schedulerLanguages;
