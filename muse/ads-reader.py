"""Read Meta ad inventory through the instance's existing Composio connection.

Only these fixed read tools are callable. Credentials remain inside Agent37;
stdout contains a small, explicitly selected dashboard response, never raw MCP data.
"""
import base64
import datetime
import json
import math
import os
import re
import sys
import urllib.error
import urllib.request

READ_TOOLS = {'METAADS_GET_OBJECT', 'METAADS_GET_INSIGHTS'}
PERIODS = {'today', 'last_7d', 'last_30d'}
AD_FIELDS = 'id,name,status,effective_status,campaign{id,name,effective_status},adset{id,name,effective_status},creative{id,thumbnail_url,image_url,body,title,video_id,object_story_spec},updated_time'
ACCOUNT_FIELDS = 'id,account_id,name,currency,timezone_name,account_status'
METRICS = ['ad_id', 'spend', 'impressions', 'clicks', 'ctr', 'cpc', 'date_start', 'date_stop']


class ReadError(Exception):
    def __init__(self, code='meta_unavailable'):
        self.code = code


def unwrap(result):
    if result.get('error') or result.get('isError'):
        raise ReadError()
    if 'result' in result:
        return unwrap(result['result'])
    if 'content' in result:
        for part in result['content']:
            if part.get('type') == 'text':
                try:
                    return json.loads(part['text'])
                except (ValueError, KeyError):
                    pass
        raise ReadError()
    return result


def safe_error(response):
    # Classify errors without returning provider messages that may contain secrets.
    text = json.dumps(response).lower()
    if any(s in text for s in ['oauth', 'expired', 'invalid access token', 'code": 190', 'not connected']):
        return ReadError('reconnect_required')
    if any(s in text for s in ['permission', 'ads_read', 'access denied']):
        return ReadError('permission_required')
    return ReadError()


class MetaReader:
    def __init__(self, connection):
        self.connection = connection

    def execute(self, jobs):
        if any(slug not in READ_TOOLS for slug, _ in jobs):
            raise ReadError('invalid_request')
        payload = {'jsonrpc': '2.0', 'id': 1, 'method': 'tools/call', 'params': {
            'name': 'COMPOSIO_MULTI_EXECUTE_TOOL', 'arguments': {
                'tools': [{'tool_slug': slug, 'arguments': args, 'account': self.connection} for slug, args in jobs],
                'current_step': 'READING_META_ADS_DASHBOARD',
            }}}
        req = urllib.request.Request(os.environ['AGENT37_COMPOSIO_MCP_URL'], data=json.dumps(payload).encode(), headers={
            'Authorization': 'Bearer ' + os.environ['AGENT37_MANAGED_TOKEN'],
            'Content-Type': 'application/json', 'Accept': 'application/json, text/event-stream',
        })
        try:
            with urllib.request.urlopen(req, timeout=60) as res:
                raw = res.read(8_000_000).decode()
            if raw.lstrip().startswith('{'):
                result = json.loads(raw)
            else:
                events = [json.loads(line[5:].strip()) for line in raw.splitlines() if line.startswith('data:')]
                result = next(event for event in events if 'result' in event or 'error' in event)
            data = unwrap(result)
            if not data.get('successful'):
                raise safe_error(data)
            rows = data['data']['results']
            if len(rows) != len(jobs):
                raise ReadError()
            # The batch reports an index for each submitted job.
            return [next(row['response'] for row in rows if row['index'] == i) for i in range(len(jobs))]
        except ReadError:
            raise
        except Exception:
            raise ReadError()

    def one(self, slug, args):
        response = self.execute([(slug, args)])[0]
        if not response.get('successful'):
            raise safe_error(response)
        return response['data']

    def edge(self, object_id, edge, fields, cursor=None):
        paging = '.after(' + json.dumps(cursor) + ')' if cursor else ''
        return self.one('METAADS_GET_OBJECT', {'object_id': object_id, 'fields': [f'{edge}.limit(100){paging}{{{fields}}}']})[edge]


def collect(first, next_page, max_pages=10):
    result = []
    page = first
    seen = set()
    for _ in range(max_pages):
        if not isinstance(page.get('data'), list):
            raise ReadError()
        result.extend(page['data'])
        paging = page.get('paging') or {}
        if not paging.get('next'):
            return result, False
        cursor = (paging.get('cursors') or {}).get('after')
        if not isinstance(cursor, str) or cursor in seen or len(cursor) > 4000:
            return result, True
        seen.add(cursor)
        if len(seen) < max_pages:
            page = next_page(cursor)
    return result, True


def number(value):
    if value is None or value == '' or isinstance(value, bool):
        return None
    try:
        value = float(value)
        return value if math.isfinite(value) and value >= 0 else None
    except (ValueError, TypeError):
        return None


def text(value, limit=1000):
    return str(value or '')[:limit]


def effective_status(ad):
    # Effective status normally already incorporates parent state. Keep parent
    # pauses visible even if a provider returns only the ad's configured status.
    status = ad.get('effective_status') or ad.get('status') or 'UNKNOWN'
    if status == 'ACTIVE':
        for parent, paused in [('campaign', 'CAMPAIGN_PAUSED'), ('adset', 'ADSET_PAUSED')]:
            value = (ad.get(parent) or {}).get('effective_status')
            if value and value != 'ACTIVE':
                return paused if value == 'PAUSED' else value
    return status


def normalize_ad(ad, insights):
    creative = ad.get('creative') or {}
    story = creative.get('object_story_spec') or {}
    asset = story.get('video_data') or story.get('link_data') or story.get('photo_data') or {}
    stats = insights.get(ad['id'])
    return {
        'id': text(ad['id']), 'name': text(ad.get('name'), 300),
        'status': text(effective_status(ad), 50), 'configured_status': text(ad.get('status'), 50),
        'campaign': {k: text((ad.get('campaign') or {}).get(k), 300) for k in ['id', 'name']},
        'adset': {k: text((ad.get('adset') or {}).get(k), 300) for k in ['id', 'name']},
        'creative': {'image_url': text(creative.get('image_url') or asset.get('image_url') or asset.get('picture') or creative.get('thumbnail_url'), 4000),
                     'body': text(creative.get('body') or asset.get('message'), 2000),
                     'title': text(creative.get('title') or asset.get('title') or asset.get('name'), 300),
                     'format': 'Video' if creative.get('video_id') or story.get('video_data') else 'Image / creative'},
        'metrics': {k: number(stats.get(k)) if stats else None for k in ['spend', 'impressions', 'clicks', 'ctr', 'cpc']},
        'has_insights': bool(stats),
        'date_start': stats.get('date_start') if stats else None,
        'date_stop': stats.get('date_stop') if stats else None,
    }


def snapshot(reader, account_id, period):
    accounts, accounts_partial = collect(reader.edge('me', 'adaccounts', ACCOUNT_FIELDS), lambda cursor: reader.edge('me', 'adaccounts', ACCOUNT_FIELDS, cursor))
    accounts = [{k: row.get(k) for k in ['id', 'name', 'currency', 'timezone_name', 'account_status']} for row in accounts]
    if not accounts:
        return {'accounts': [], 'account': None, 'ads': [], 'warnings': [], 'partial': accounts_partial, 'period': period}
    account = next((a for a in accounts if a['id'] == account_id), None) if account_id else accounts[0]
    if not account:
        raise ReadError('account_not_found')
    account_id = account['id']
    insight_args = {'object_id': account_id, 'level': 'ad', 'date_preset': period, 'fields': METRICS, 'limit': 100}
    ads_result, insights_result = reader.execute([
        ('METAADS_GET_OBJECT', {'object_id': account_id, 'fields': [f'ads.limit(100){{{AD_FIELDS}}}']}),
        ('METAADS_GET_INSIGHTS', insight_args),
    ])
    if not ads_result.get('successful'):
        raise safe_error(ads_result)
    ads, ads_partial = collect(ads_result['data']['ads'], lambda cursor: reader.edge(account_id, 'ads', AD_FIELDS, cursor))
    warnings = []
    insights = []
    insights_partial = False
    try:
        if not insights_result.get('successful'):
            raise safe_error(insights_result)
        insights, insights_partial = collect(insights_result['data'], lambda cursor: reader.one('METAADS_GET_INSIGHTS', {**insight_args, 'after': cursor}))
    except ReadError:
        warnings.append('Performance data could not be loaded. Ad status and creatives are still available.')
    metrics = {row['ad_id']: row for row in insights if row.get('ad_id')}
    normalized = [normalize_ad(ad, metrics) for ad in ads if ad.get('id')]
    result = {'accounts': accounts, 'account': account, 'ads': normalized, 'period': period,
              'partial': accounts_partial or ads_partial or insights_partial, 'warnings': warnings}
    # Hosting exec has an output cap. Report partial results explicitly rather
    # than emitting invalid/truncated JSON for very large accounts.
    while len(json.dumps(result).encode()) > 380_000 and normalized:
        normalized.pop()
        result['partial'] = True
    return result


def main():
    try:
        request = json.loads(base64.b64decode(sys.argv[1], validate=True))
        connection, account, period = request['connection'], request.get('account', ''), request.get('period', 'today')
        if not re.fullmatch(r'[A-Za-z0-9_-]{1,100}', connection) or (account and not re.fullmatch(r'act_\d{1,30}', account)) or period not in PERIODS:
            raise ReadError('invalid_request')
        result = snapshot(MetaReader(connection), account, period)
        result['updated_at'] = datetime.datetime.now(datetime.timezone.utc).isoformat()
        print(json.dumps({'ok': True, **result}, allow_nan=False))
    except Exception as error:
        print(json.dumps({'ok': False, 'code': error.code if isinstance(error, ReadError) else 'meta_unavailable'}))


if __name__ == '__main__':
    main()
