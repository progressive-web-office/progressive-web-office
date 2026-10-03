import { describe, expect, it } from 'vitest';
import { completionQuery, rankCompletions } from '../src/document/pm/complete';

describe('FOLDER-021 completion of links and tags', () => {
  it('finds what the text before the cursor asks for', () => {
    expect(completionQuery('See [[')).toEqual({ kind: 'link', query: '', length: 2 });
    expect(completionQuery('See [[pro')).toEqual({ kind: 'link', query: 'pro', length: 5 });
    expect(completionQuery('See [[a]] and')).toBeNull();
    expect(completionQuery('done #to')).toEqual({ kind: 'tag', query: 'to', length: 3 });
    expect(completionQuery('#phys')).toEqual({ kind: 'tag', query: 'phys', length: 5 });
    expect(completionQuery('issue#12')).toBeNull();
    expect(completionQuery('done #')).toBeNull();
    expect(completionQuery('plain text')).toBeNull();
    // DOC-037: snippets.
    expect(completionQuery('Hello ;;da')).toEqual({ kind: 'snippet', query: 'da', length: 4 });
    expect(completionQuery(';;')).toEqual({ kind: 'snippet', query: '', length: 2 });
    expect(completionQuery('a;;b')).toBeNull();
  });

  it('ranks the matches: starting with the query, then containing it', () => {
    expect(rankCompletions(['Projects', 'notes/projet', 'Meeting', 'Old project', 'project'], 'proj')).toEqual(['project', 'Projects', 'Old project', 'notes/projet']);
    expect(rankCompletions(['alpha', 'beta', 'alphabet'], 'bet')).toEqual(['beta', 'alphabet']);
    expect(rankCompletions(['todo'], 'todo')).toEqual([]);
    expect(rankCompletions(Array.from({ length: 20 }, (_, i) => `n${i}`), '', 5)).toHaveLength(5);
  });
});
