#!/usr/bin/env python3
"""Build an independent, source-only AMF HTML audit baseline; not a production parser."""
import argparse
import datetime
import hashlib
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlsplit

BASE = 'https://www.amf-france.org/'
VOID = frozenset('area base br col embed hr img input link meta param source track wbr'.split())


class Node:
    def __init__(self, tag, attrs=(), parent=None):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children = []

    def has_class(self, name):
        return name in self.attrs.get('class', '').split()

    def text(self):
        return ''.join(child if isinstance(child, str) else child.text() for child in self.children)

    def elements(self):
        return [child for child in self.children if isinstance(child, Node)]


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node('#document')
        self.current = self.root

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs, self.current)
        self.current.children.append(node)
        if tag not in VOID:
            self.current = node

    def handle_startendtag(self, tag, attrs):
        self.current.children.append(Node(tag, attrs, self.current))

    def handle_endtag(self, tag):
        node = self.current
        while node.parent and node.tag != tag:
            node = node.parent
        if node.parent:
            self.current = node.parent

    def handle_data(self, data):
        self.current.children.append(data)


def walk(node):
    for child in node.elements():
        yield child
        yield from walk(child)


def ancestor(node, cls):
    node = node.parent
    while node:
        if node.has_class(cls):
            return node
        node = node.parent
    return None


def one(items, description):
    if len(items) != 1:
        raise ValueError(f'{description}: expected one, found {len(items)}')
    return items[0]


def sha(text):
    return 'sha256:' + hashlib.sha256(text.encode('utf-8')).hexdigest()


def url(value):
    if not value:
        raise ValueError('missing source URL')
    if '?' in value or '#' in value:
        raise ValueError(f'query or fragment in source identity URL: {value!r}')
    result = urljoin(BASE, value)
    parsed = urlsplit(result)
    if parsed.scheme != 'https' or parsed.netloc != 'www.amf-france.org' or parsed.query or parsed.fragment:
        raise ValueError(f'invalid source identity URL: {value!r}')
    return result


def build(path):
    raw = path.read_bytes()
    parser = Tree()
    parser.feed(raw.decode('utf-8', errors='strict'))
    parser.close()
    nodes = list(walk(parser.root))
    canonical = url(one([n for n in nodes if n.tag == 'link' and 'canonical' in n.attrs.get('rel', '').split()], 'canonical link').attrs.get('href'))
    title = one([n for n in nodes if n.tag == 'h1' and n.has_class('rg-title')], 'version title')
    about = title.attrs.get('about', '')
    canonical_match = re.fullmatch(r'https://www\.amf-france\.org/fr/eli/fr/aai/amf/rg/(\d{8})/notes', canonical)
    about_match = re.fullmatch(r'/eli/fr/aai/amf/rg/(\d{8})', about)
    title_match = re.fullmatch(r"\s*Règlement général de l'AMF en vigueur au (\d{2})/(\d{2})/(\d{4})\s*", title.text())
    if not canonical_match or not about_match or not title_match:
        raise ValueError('unrecognized canonical, title, or expression identity')
    date = canonical_match.group(1)
    if date != about_match.group(1) or date != title_match.group(3) + title_match.group(2) + title_match.group(1):
        raise ValueError('canonical, expression and title dates do not match')
    datetime.datetime.strptime(date, '%Y%m%d')
    groups = []
    articles = []
    notes = []
    group_by_node = {}
    article_by_node = {}
    for node in nodes:
        if node.has_class('rg-part'):
            parent = ancestor(node, 'rg-part')
            group_url = url(node.attrs.get('data-eli-content'))
            heading = one([n for n in node.elements() if n.tag in ('h2', 'h3', 'h4', 'h5', 'h6') or n.has_class('like-h7') or n.has_class('like-h8')], 'group heading')
            anchor = one([n for n in walk(heading) if n.tag == 'a'], 'group heading anchor')
            if url(anchor.attrs.get('href')) != group_url:
                raise ValueError(f'group heading URL differs from data-eli-content: {group_url}')
            group = {'sourceUrl': group_url, 'parentSourceUrl': url(parent.attrs.get('data-eli-content')) if parent else None, 'label': heading.text(), 'notes': []}
            groups.append(group)
            group_by_node[node] = group
        elif node.has_class('art'):
            group_node = ancestor(node, 'rg-part')
            if group_node not in group_by_node:
                raise ValueError('article without group')
            title_node = one([n for n in node.elements() if n.has_class('art-titre')], 'article title')
            anchor = one([n for n in walk(title_node) if n.tag == 'a'], 'article link')
            content = one([n for n in node.elements() if n.has_class('art-content')], 'article content')
            article = {'label': title_node.text(), 'rawHref': anchor.attrs.get('href'), 'sourceUrl': url(anchor.attrs.get('href')), 'groupSourceUrl': group_by_node[group_node]['sourceUrl'], 'contentSha256': sha(content.text()), 'notes': []}
            articles.append(article)
            article_by_node[node] = article
        elif node.has_class('note-amf'):
            art = ancestor(node, 'art')
            group_node = ancestor(node, 'rg-part')
            if art:
                owner, scope = article_by_node[art], 'article'
                owner_url = owner['sourceUrl']
            elif group_node:
                owner, scope = group_by_node[group_node], 'group'
                owner_url = owner['sourceUrl']
            else:
                owner, scope, owner_url = None, 'document', canonical
            note = {'scope': scope, 'ownerSourceUrl': owner_url, 'position': node.parent.elements().index(node), 'textSha256': sha(node.text())}
            notes.append(note)
            if owner is not None:
                owner['notes'].append({'index': len(notes) - 1, 'textSha256': note['textSha256']})
    if (len(groups), len(articles), len(notes)) != (693, 1821, 132):
        raise ValueError(f'unexpected source counts: {len(groups)}, {len(articles)}, {len(notes)}')
    if tuple(sum(n['scope'] == scope for n in notes) for scope in ('document', 'group', 'article')) != (1, 63, 68):
        raise ValueError('unexpected note scope counts')
    normalized_labels = {re.sub(r'\s+', ' ', unicodedata.normalize('NFC', a['label'])).strip() for a in articles}
    if len(normalized_labels) != len(articles):
        raise ValueError('duplicate normalized complete article label')
    if len({g['sourceUrl'] for g in groups}) != len(groups) or len({a['sourceUrl'] for a in articles}) != len(articles) or len({a['label'] for a in articles}) != len(articles):
        raise ValueError('duplicate source group URL, article URL, or complete article label')
    return {'schemaVersion': '1.0', 'input': {'sha256': 'sha256:' + hashlib.sha256(raw).hexdigest(), 'bytes': len(raw)}, 'source': {'canonicalUrl': canonical, 'versionDate': f'{date[:4]}-{date[4:6]}-{date[6:]}', 'title': title.text()}, 'groups': groups, 'articles': articles, 'notes': notes}


def first_difference(expected, actual, path='$'):
    if type(expected) is not type(actual):
        return f'{path}: type differs'
    if isinstance(expected, dict):
        if expected.keys() != actual.keys():
            return f'{path}: keys differ (missing={sorted(expected.keys() - actual.keys())}, extra={sorted(actual.keys() - expected.keys())})'
        for key in expected:
            difference = first_difference(expected[key], actual[key], f'{path}.{key}')
            if difference:
                return difference
    elif isinstance(expected, list):
        if len(expected) != len(actual):
            return f'{path}: length differs ({len(expected)} vs {len(actual)})'
        for index, (left, right) in enumerate(zip(expected, actual)):
            difference = first_difference(left, right, f'{path}[{index}]')
            if difference:
                return difference
    elif expected != actual:
        return f'{path}: value differs'
    return None


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument('--input', required=True, type=Path)
    cli.add_argument('--output', type=Path)
    cli.add_argument('--candidate', type=Path)
    args = cli.parse_args()
    if not args.output and not args.candidate:
        cli.error('at least one of --output or --candidate is required')
    result = build(args.input)
    if args.candidate:
        candidate = json.loads(args.candidate.read_text(encoding='utf-8'))
        if not isinstance(candidate, dict) or 'baseline' not in candidate:
            raise ValueError('candidate must contain baseline')
        difference = first_difference(result, candidate['baseline'])
        if difference:
            raise ValueError('candidate baseline mismatch: ' + difference)
        print(f"AMF baseline matches: {len(result['groups'])} groups, {len(result['articles'])} articles, {len(result['notes'])} notes")
    if args.output:
        args.output.write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
