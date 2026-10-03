/**
 * CODE-018: completion for the languages without a language service (Lua, R,
 * C/C++, SQL): their keywords and usual functions, and the words of the code
 * (SQL keywords come with its grammar).
 */
import { completeAnyWord, completeFromList, type Completion, type CompletionSource } from '@codemirror/autocomplete';
import { EditorState, type Extension } from '@codemirror/state';

const list = (type: string, words: string): Completion[] => words.split(/\s+/).filter(Boolean).map((label) => ({ label, type }));

const WORDS: Record<'lua' | 'r' | 'cpp', Completion[]> = {
  lua: [
    ...list('keyword', 'and break do else elseif end false for function goto if in local nil not or repeat return then true until while'),
    ...list('function', 'assert collectgarbage dofile error getmetatable ipairs load loadfile next pairs pcall print rawequal rawget rawlen rawset require select setmetatable tonumber tostring type xpcall'),
    ...list('namespace', 'coroutine debug io math os package string table utf8'),
    ...list(
      'method',
      'string.format string.sub string.gsub string.gmatch string.find string.match string.rep string.upper string.lower string.len string.byte string.char table.insert table.remove table.concat table.sort table.unpack math.floor math.ceil math.max math.min math.abs math.sqrt math.random math.pi math.huge io.write io.read io.open os.time os.clock os.date',
    ),
  ],
  r: [
    ...list('keyword', 'if else for while repeat function return next break TRUE FALSE NULL NA NaN Inf in library require'),
    ...list(
      'function',
      'c list vector matrix data.frame factor seq seq_len seq_along rep length names nrow ncol dim head tail summary str print cat paste paste0 sprintf format mean median sd var min max sum prod range quantile table unique sort order rev which apply sapply lapply vapply mapply tapply aggregate merge subset with within lm glm predict residuals coef anova t.test chisq.test cor plot hist boxplot barplot lines points abline legend par read.csv write.csv readLines writeLines source setwd getwd file.path nchar substr strsplit gsub sub grepl toupper tolower round floor ceiling sqrt exp log abs is.na ifelse stop warning tryCatch invisible commandArgs',
    ),
  ],
  cpp: [
    ...list(
      'keyword',
      'auto break case char class const constexpr continue default delete do double else enum explicit extern false float for friend if inline int long namespace new nullptr operator private protected public return short signed sizeof static struct switch template this true typedef typename union unsigned using virtual void volatile while bool',
    ),
    ...list('function', 'printf scanf puts putchar getchar fopen fclose fprintf fscanf fgets malloc calloc realloc free memcpy memset strlen strcpy strcmp strcat sqrt pow abs fabs exit main'),
    ...list(
      'type',
      'std::vector std::string std::map std::unordered_map std::set std::pair std::array std::cout std::cin std::endl std::sort std::find std::max std::min std::swap std::accumulate std::begin std::end std::size_t std::unique_ptr std::make_unique std::shared_ptr size_t',
    ),
    ...list('keyword', '#include #define #ifdef #ifndef #endif #pragma'),
  ],
};

const sources = new Map<WordLang, CompletionSource[]>();

/**
 * Completion sources of a language: its words, then the words of the code.
 * The same functions each time: completion knows a source by its identity.
 */
export function wordSources(lang: WordLang): CompletionSource[] {
  let found = sources.get(lang);
  if (!found) sources.set(lang, (found = lang === 'sql' ? [completeAnyWord] : [completeFromList(WORDS[lang]), completeAnyWord]));
  return found;
}

/** The sources, given as language data so that they come with the language's own (SQL keywords). */
export function wordCompletion(lang: WordLang): Extension {
  const data = wordSources(lang).map((autocomplete) => ({ autocomplete }));
  return EditorState.languageData.of(() => data);
}

export type WordLang = keyof typeof WORDS | 'sql';
export const hasWords = (lang: string): lang is WordLang => lang in WORDS || lang === 'sql';
