import os
from opensearchpy import OpenSearch

OPENSEARCH_HOST = os.environ['OPENSEARCH_HOST']


def handler(event, _):
    client = OpenSearch(
        hosts=[{'host': OPENSEARCH_HOST, 'port': 443}],
        http_compress=True,
        use_ssl=True,
        verify_certs=True,
        ssl_assert_hostname=False,
        ssl_show_warn=False,
    )

    client.index(
        index='lambda_log',
        body=event
    )
