---
layout: post
title: "An Ode to Merge Join"
date: 2026-02-10
---

[Merge join](https://en.wikipedia.org/wiki/Sort-merge_join) is such a delightful algorithm.

I've written a lot of Python that syncs data sources (CSV dumps, API responses, etc.) with a relational database. No matter your approach, you will need to figure out what's been added, what's changed, and what's been deleted, then handle those cases appropriately.

My early attempts would read the source data into a hash table and then compare it with my database. It works, and it's fast. But at ten million rows the hash table alone can consume 3 GB of RAM. That's not 3 GB of data; it's Python object overhead wrapping maybe 300 MB of payload. RAM prices being what they are, this is a budget problem as much as a technical one.

A merge join does the same comparison in 19 MB. Constant regardless of dataset size. In 25 lines of Python.

Any time both sides of a comparison are sorted by the same key, you can walk them in lockstep and produce a complete diff in a single pass. Data often has a natural order; just add an index on the destination to match it. No hash table, no temp table. An in-application merge join will do the trick.

## The algorithm

Two sorted inputs, two pointers. Advance whichever pointer has the smaller key. When the keys match, you have a pair. When they don't, you have an insert or a delete.

```python
def merge_join(left, right, left_key, right_key):
    left_item = next(left, None)
    right_item = next(right, None)

    while left_item is not None and right_item is not None:
        lk = left_key(left_item)
        rk = right_key(right_item)

        if lk < rk:
            yield (left_item, None)
            left_item = next(left, None)
        elif lk > rk:
            yield (None, right_item)
            right_item = next(right, None)
        else:
            yield (left_item, right_item)
            left_item = next(left, None)
            right_item = next(right, None)

    while left_item is not None:
        yield (left_item, None)
        left_item = next(left, None)
    while right_item is not None:
        yield (None, right_item)
        right_item = next(right, None)
```

It takes any two sorted iterables and key functions. The output encodes the operation through presence and absence: `(left, None)` is an insert - the row exists in the source but not the destination. `(None, right)` is a delete. `(left, right)` is a potential update - both rows are right there for field-by-field comparison. A full outer join on unique keys in a single pass.

Ondrej Kokes [blogged about a Python implementation](https://kokes.github.io/blog/2018/11/25/merging-streams-python.html) that cleverly uses `heapq.merge()` and `itertools.groupby()`, but it is slightly slower in my tests and didn't save that many lines over the hand-written version above.

## Interactive example

Step through the algorithm on a small dataset — an 8-row CSV synced against a 7-row database table:

<style>
#merge-join-viz {
  margin: 1.5em 0;
  padding: 1em;
  border: 1px solid #ddd;
  border-radius: 6px;
}
#merge-join-viz .mjv-controls {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  flex-wrap: wrap;
}
#merge-join-viz button {
  padding: 6px 16px;
  border: 1px solid #ccc;
  border-radius: 4px;
  background: #fff;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
}
#merge-join-viz button:hover:not(:disabled) { background: #f0f0f0; }
#merge-join-viz button:disabled { opacity: 0.4; cursor: default; }
#merge-join-viz .mjv-counter { margin-left: auto; font-size: 13px; color: #888; }
#merge-join-viz .mjv-tables { display: flex; gap: 24px; }
#merge-join-viz .mjv-panel { flex: 1; min-width: 0; overflow-x: auto; }
#merge-join-viz .mjv-label { font-weight: 600; font-size: 14px; margin-bottom: 6px; color: #555; }
#merge-join-viz table { width: 100%; border-collapse: collapse; font-size: 14px; }
#merge-join-viz th,
#merge-join-viz td { padding: 5px 8px; text-align: left; border: none; border-bottom: 1px solid #f0f0f0; }
#merge-join-viz th {
  border-bottom: 2px solid #e0e0e0;
  font-size: 11px;
  font-weight: 600;
  color: #999;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
#merge-join-viz .mjv-ptr { width: 20px; padding: 5px 4px; position: relative; }
#merge-join-viz tr.mjv-current .mjv-ptr::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 6px;
  transform: translateY(-50%);
  width: 0;
  height: 0;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid #6366f1;
}
#merge-join-viz tr.mjv-match { background: #dcfce7; }
#merge-join-viz tr.mjv-delete { background: #fee2e2; }
#merge-join-viz tr.mjv-insert { background: #dcfce7; }
#merge-join-viz tr.mjv-update { background: #fef3c7; }
#merge-join-viz tr.mjv-current { box-shadow: inset 3px 0 0 #6366f1; }
#merge-join-viz .mjv-status {
  margin: 12px 0;
  padding: 10px 14px;
  background: #f8f8f8;
  border-radius: 4px;
  font-size: 14px;
  line-height: 1.5;
}
#merge-join-viz .mjv-result {
  padding: 4px 10px;
  margin: 3px 0;
  border-radius: 3px;
  font-size: 13px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: #000;
}
#merge-join-viz .mjv-result-match { background: #fff; }
#merge-join-viz .mjv-result-delete { background: #fee2e2; }
#merge-join-viz .mjv-result-insert { background: #dcfce7; }
#merge-join-viz .mjv-result-update { background: #fef3c7; }
@media (prefers-color-scheme: dark) {
  #merge-join-viz { background: #fff; color: #000; }
}
@media (max-width: 500px) {
  #merge-join-viz .mjv-tables { flex-direction: column; gap: 12px; }
}
</style>

<div id="merge-join-viz"></div>

<script>
(function() {
  var csv = [
    [102, 'Alice', '100.00'],
    [108, 'Bob', '200.00'],
    [215, 'Diana', '400.00'],
    [302, 'Eve', '550.00'],
    [305, 'Frank', '600.00'],
    [410, 'Grace', '700.00'],
    [523, 'Ivan', '900.00'],
    [601, 'Judy', '1000.00']
  ];
  var db = [
    [102, 'Alice', '100.00'],
    [108, 'Bob', '250.00'],
    [112, 'Charlie', '300.00'],
    [302, 'Eve', '500.00'],
    [410, 'Grace', '700.00'],
    [417, 'Heidi', '800.00'],
    [601, 'Judy', '1000.00']
  ];
  var steps = [
    { c: 0, d: 0, type: 'match',
      text: 'CSV key (102) = DB key (102). Keys match \u2014 fields identical.',
      result: 'Match: id=102, Alice \u2014 no changes',
      cc: [], dc: [] },
    { c: 1, d: 1, type: 'update',
      text: 'CSV key (108) = DB key (108). Keys match \u2014 amount differs (250 \u2192 200).',
      result: 'Update: id=108, Bob (amount: 250 \u2192 200)',
      cc: [[1, 'update']], dc: [] },
    { c: 2, d: 2, type: 'delete',
      text: 'CSV key (215) > DB key (112). id=112 exists only in database \u2014 delete.',
      result: 'Delete: id=112, Charlie',
      cc: [], dc: [[2, 'delete']] },
    { c: 2, d: 3, type: 'insert',
      text: 'CSV key (215) < DB key (302). id=215 exists only in CSV \u2014 insert.',
      result: 'Insert: id=215, Diana',
      cc: [[2, 'insert']], dc: [] },
    { c: 3, d: 3, type: 'update',
      text: 'CSV key (302) = DB key (302). Keys match \u2014 amount differs (500 \u2192 550).',
      result: 'Update: id=302, Eve (amount: 500 \u2192 550)',
      cc: [[3, 'update']], dc: [] },
    { c: 4, d: 4, type: 'insert',
      text: 'CSV key (305) < DB key (410). id=305 exists only in CSV \u2014 insert.',
      result: 'Insert: id=305, Frank',
      cc: [[4, 'insert']], dc: [] },
    { c: 5, d: 4, type: 'match',
      text: 'CSV key (410) = DB key (410). Keys match \u2014 fields identical.',
      result: 'Match: id=410, Grace \u2014 no changes',
      cc: [], dc: [] },
    { c: 6, d: 5, type: 'delete',
      text: 'CSV key (523) > DB key (417). id=417 exists only in database \u2014 delete.',
      result: 'Delete: id=417, Heidi',
      cc: [], dc: [[5, 'delete']] },
    { c: 6, d: 6, type: 'insert',
      text: 'CSV key (523) < DB key (601). id=523 exists only in CSV \u2014 insert.',
      result: 'Insert: id=523, Ivan',
      cc: [[6, 'insert']], dc: [] },
    { c: 7, d: 6, type: 'match',
      text: 'CSV key (601) = DB key (601). Keys match \u2014 fields identical.',
      result: 'Match: id=601, Judy \u2014 no changes',
      cc: [], dc: [] },
    { c: -1, d: -1, type: 'done',
      text: 'Both inputs exhausted. Sync complete: 3 inserts, 2 updates, 2 deletes.',
      result: null, cc: [], dc: [] }
  ];

  var cur = -1, timer = null;
  var el = document.getElementById('merge-join-viz');

  function tbl(data, id) {
    var h = '<table id="' + id + '"><thead><tr>' +
      '<th class="mjv-ptr"></th><th>id</th><th>name</th><th>amount</th>' +
      '</tr></thead><tbody>';
    for (var i = 0; i < data.length; i++) {
      h += '<tr id="' + id + i + '"><td class="mjv-ptr"></td>' +
        '<td>' + data[i][0] + '</td><td>' + data[i][1] + '</td>' +
        '<td>' + data[i][2] + '</td></tr>';
    }
    return h + '</tbody></table>';
  }

  el.innerHTML =
    '<div class="mjv-controls">' +
      '<button id="mjv-step">Step</button>' +
      '<button id="mjv-play">Play</button>' +
      '<button id="mjv-reset">Reset</button>' +
      '<span class="mjv-counter" id="mjv-ctr"></span>' +
    '</div>' +
    '<div class="mjv-tables">' +
      '<div class="mjv-panel"><div class="mjv-label">CSV (Source)</div>' +
        tbl(csv, 'c') + '</div>' +
      '<div class="mjv-panel"><div class="mjv-label">Database</div>' +
        tbl(db, 'd') + '</div>' +
    '</div>' +
    '<div class="mjv-status" id="mjv-st" aria-live="polite"></div>' +
    '<div class="mjv-output" id="mjv-out"></div>';

  var stepBtn = document.getElementById('mjv-step');
  var playBtn = document.getElementById('mjv-play');
  document.getElementById('mjv-reset').addEventListener('click', doReset);
  stepBtn.addEventListener('click', doStep);
  playBtn.addEventListener('click', togglePlay);

  function render() {
    var i, tr, s;
    for (i = 0; i < csv.length; i++) {
      document.getElementById('c' + i).className = '';
    }
    for (i = 0; i < db.length; i++) {
      document.getElementById('d' + i).className = '';
    }
    for (s = 0; s <= cur && s < steps.length; s++) {
      for (i = 0; i < steps[s].cc.length; i++)
        document.getElementById('c' + steps[s].cc[i][0]).classList.add('mjv-' + steps[s].cc[i][1]);
      for (i = 0; i < steps[s].dc.length; i++)
        document.getElementById('d' + steps[s].dc[i][0]).classList.add('mjv-' + steps[s].dc[i][1]);
    }
    if (cur >= 0 && cur < steps.length && steps[cur].c >= 0) {
      document.getElementById('c' + steps[cur].c).classList.add('mjv-current');
    }
    if (cur >= 0 && cur < steps.length && steps[cur].d >= 0) {
      document.getElementById('d' + steps[cur].d).classList.add('mjv-current');
    }
    if (cur === -1) {
      document.getElementById('c0').classList.add('mjv-current');
      document.getElementById('d0').classList.add('mjv-current');
    }
    document.getElementById('mjv-st').innerHTML =
      cur === -1
        ? 'Press <b>Step</b> to walk through the merge join.'
        : steps[cur].text;
    var out = '';
    for (s = 0; s <= cur && s < steps.length; s++) {
      if (steps[s].result) {
        out += '<div class="mjv-result mjv-result-' + steps[s].type + '">' +
          steps[s].result + '</div>';
      }
    }
    document.getElementById('mjv-out').innerHTML = out;
    document.getElementById('mjv-ctr').textContent =
      cur === -1 ? '' : 'Step ' + (cur + 1) + ' of ' + steps.length;
    stepBtn.disabled = cur >= steps.length - 1;
    if (cur >= steps.length - 1 && timer) {
      clearInterval(timer);
      timer = null;
      playBtn.textContent = 'Play';
    }
  }

  function doStep() {
    if (cur < steps.length - 1) { cur++; render(); }
  }

  function togglePlay() {
    if (timer) {
      clearInterval(timer);
      timer = null;
      playBtn.textContent = 'Play';
    } else {
      if (cur >= steps.length - 1) cur = -1;
      playBtn.textContent = 'Pause';
      doStep();
      timer = setInterval(function() {
        if (cur >= steps.length - 1) {
          clearInterval(timer);
          timer = null;
          playBtn.textContent = 'Play';
        } else { doStep(); }
      }, 1200);
    }
  }

  function doReset() {
    if (timer) { clearInterval(timer); timer = null; playBtn.textContent = 'Play'; }
    cur = -1;
    render();
  }

  render();
})();
</script>

## Using it for sync

This is why I love this approach. Stream both sides row by row, sorted by the same key, and the sync logic practically writes itself - generators for your source and destination, and the sync function is left with a single loop that has clear insert/modify/delete conditions:

```python
def csv_row_generator(csv_path):
    with open(csv_path) as f:
        next(f)  # skip header
        for line in f:
            parts = line.rstrip("\n").split(",", 3)
            yield (int(parts[0]), parts[1], parts[2], float(parts[3]))


def db_row_generator(conn):
    cursor = conn.execute(
        "SELECT id, name, email, amount FROM records ORDER BY id"
    )
    yield from cursor


def sync(conn, csv_path):
    csv_stream = csv_row_generator(csv_path)
    db_stream = db_row_generator(conn)

    updated = deleted = inserted = 0

    for csv_row, db_row in merge_join(
        csv_stream, db_stream,
        left_key=lambda row: row[0],
        right_key=lambda row: row[0],
    ):
        if db_row is None:
            # new record handling goes here
            inserted += 1
        elif csv_row is None:
            # deleted record handling goes here
            deleted += 1
        else:
            if csv_row[1:] != db_row[1:]:
                # updated record handling goes here
                updated += 1

    return updated, deleted, inserted
```

At no point does either the full CSV or the full query result live in memory. One row from each side, compared, yielded, discarded. Memory usage is constant regardless of dataset size.

## Why this works

The merge join's power comes from *leveraging existing order*. Source data almost always has a natural order - sequential IDs, timestamps, alphabetical keys. On the destination side, an index on the join key makes `ORDER BY` essentially free: the database walks the index in order rather than sorting at query time. You get O(n) time and O(1) memory without paying the O(n log n) sort cost.

This precondition is also the pattern's main limitation. If your source data has no natural order and you need to sort it first, you pay O(n log n) time and potentially O(n) memory - and a hash join or a temporary table may be the better choice. But in practice, most data has a natural key.

## What the alternatives cost

I benchmarked three other approaches to the same CSV-to-database sync:

**Hash join** - Load the entire CSV into a dict keyed by ID, scan the database, probe with `dict.pop()`. The most natural approach. Same speed as merge join, but at 10 million rows, the dict consumes 3 GB of memory - 160x more.

**SQL join** - Load the CSV into a temp table and diff with SQL JOINs. Competitive on memory (23 MB), but 17% slower. A reasonable choice when you want to keep everything in SQL.

**Index lookup** - `SELECT ... WHERE id = ?` for each CSV row. Appears memory-efficient - one row at a time - but still requires a set of all CSV IDs for delete detection. At 10 million rows, that set uses 609 MB. The per-row queries make it 4x slower.

## Benchmarks

I benchmarked all four strategies across dataset sizes from 10,000 to 10,000,000 rows, using SQLite and measuring wall time and peak resident memory with `/usr/bin/time -v`.

[![Python sync strategy benchmark: wall time, CPU time, and peak memory vs row count]({{ site.baseurl }}/assets/images/bench_strategies_chart.png)]({{ site.baseurl }}/assets/images/bench_strategies_chart.png)

Merge join and hash join are essentially identical on wall time (~16.5s at 10M rows). The merge join gives you the memory win for free - there is no speed tradeoff.

The rightmost panel is the real story. Merge join memory is flat - 19 MB from ten thousand rows to ten million. Hash join memory is linear, reaching 3 GB at 10M rows. That's a 160x difference. For a production sync job, this is the difference between "runs anywhere" and "needs a beefy server."

## Watch out for driver buffering

The benchmarks use SQLite, where cursors are naturally streaming - the library walks the B-tree in-process, so iterating the cursor truly reads one row at a time.

Most client-server database drivers do *not* work this way by default. `psycopg2`, for example, fetches the entire result set into client memory on `execute()`, even if you iterate the cursor row by row. This silently breaks the O(1) memory property and gives you the same ~3 GB footprint as hash join.

To preserve streaming behavior, you either need to do your own batched reads or use **server-side cursors** - a per-cursor option that tells the driver to fetch rows in batches rather than all at once. The merge join code itself doesn't change. Easy to get wrong if you don't know about it, but easy to fix once you do.

## Benchmark caveats

All benchmarks use SQLite (in-process). With PostgreSQL or MySQL, the index lookup strategy would be catastrophically worse due to network round trips per row.

## A bit of history

The underlying idea, walking two sorted sequences in lockstep, is one of the oldest in computing. John von Neumann wrote a merge routine for the EDVAC in 1945, likely the first program ever designed for a stored-program computer. (Knuth tracked down the original manuscript and [analyzed it in 1970](https://dl.acm.org/doi/pdf/10.1145/356580.356581).) Thirty years later, Blasgen and Eswaran formalized the sort-merge join for IBM's System R, the prototype relational database that gave us SQL. Every major database engine still uses it.

## Merge joins in the wild

Git uses a [merge join](https://github.com/git/git/blob/864f55e1906897b630333675a52874c0fec2a45c/tree-diff.c#L361-L572) to compute the diff between two or more tree objects by iterating through their alphabetically sorted paths in lockstep, which allows it to identify additions, deletions, and modifications.

GNU Coreutils includes a join tool that does a [merge join](https://github.com/coreutils/coreutils/blob/3d35e82b9b0460769c1966b1ef8acc0b5e5c8348/src/join.c#L723-L794) on two text files.

The PostgreSQL [merge join](https://github.com/postgres/postgres/blob/9181c870bada196711206f3a795bde6b8c43dcd3/src/backend/executor/nodeMergejoin.c#L631-L1431) is wrapped in some kind of state machine to handle the fact that it has to pause/resume constantly and handle duplicates without unlimited memory buffering. In other words, if I squint at it, I can pretend like I understand what it's doing.

## Summary

Given two sorted streams, the merge join produces a complete diff in a single pass: 19 MB of memory where hash join uses 3 GB, at the same speed, in 25 lines of Python. It generalizes to any pair of sorted iterables - CSV-to-database, API-to-database, file-to-file.

The code is at [github.com/ender672/application-level-merge-join](https://github.com/ender672/application-level-merge-join).
