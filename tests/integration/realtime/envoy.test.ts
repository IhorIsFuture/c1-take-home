import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { testEnvironment } from '../../support/test-environment';

const envoyClustersSchema = z.object({
  cluster_statuses: z.array(
    z.object({
      name: z.string(),
      host_statuses: z.array(
        z.object({
          address: z.object({
            socket_address: z.object({
              address: z.string(),
              port_value: z.number().int().positive()
            })
          }),
          health_status: z.object({
            eds_health_status: z.string()
          })
        })
      )
    })
  )
});

describe('Envoy API cluster', () => {
  it('discovers both healthy API replicas', async () => {
    const response = await fetch(new URL('/clusters?format=json', testEnvironment.envoyAdminUrl));
    const clusters = envoyClustersSchema.parse(await response.json());
    const apiCluster = clusters.cluster_statuses.find(cluster => cluster.name === 'api');

    expect(response.status).toBe(200);
    expect(apiCluster).toBeDefined();
    expect(apiCluster?.host_statuses).toHaveLength(2);
    expect(
      new Set(
        apiCluster?.host_statuses.map(
          host => `${host.address.socket_address.address}:${host.address.socket_address.port_value}`
        )
      ).size
    ).toBe(2);
    expect(apiCluster?.host_statuses.map(host => host.health_status.eds_health_status)).toEqual([
      'HEALTHY',
      'HEALTHY'
    ]);
  });
});
