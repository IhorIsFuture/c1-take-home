const endpointNames = ['conversation_list', 'message_list', 'user_search', 'message_create'];

function taggedMetric(metric, tags) {
  const selector = Object.entries(tags)
    .map(([name, value]) => `${name}:${value}`)
    .join(',');

  return `${metric}{${selector}}`;
}

function endpointThresholds(phase, latency) {
  return Object.fromEntries(
    endpointNames.map(endpoint => [
      taggedMetric('http_req_duration', { endpoint, phase }),
      [`p(95)<${latency[endpoint]}`]
    ])
  );
}

function reliabilityThresholds({ phase, checks, failures, latency, droppedIterations = false }) {
  return {
    [taggedMetric('checks', { phase })]: [checks],
    [taggedMetric('http_reqs', { phase })]: ['count>0'],
    [taggedMetric('http_req_failed', { phase })]: [failures],
    [taggedMetric('http_req_duration', { phase })]: [`p(95)<${latency}`],
    ...(droppedIterations ? { [taggedMetric('dropped_iterations', { phase })]: ['count==0'] } : {})
  };
}

const smokeScenario = exec => ({
  executor: 'shared-iterations',
  exec,
  vus: 1,
  iterations: 1,
  maxDuration: '30s',
  tags: { phase: 'measured' }
});

const constantArrivalScenario = (
  exec,
  rate,
  duration,
  preAllocatedVUs,
  maxVUs,
  phase = 'measured'
) => ({
  executor: 'constant-arrival-rate',
  exec,
  rate,
  timeUnit: '1s',
  duration,
  preAllocatedVUs,
  maxVUs,
  gracefulStop: '10s',
  tags: { phase }
});

const stressScenario = (exec, startRate, targets, preAllocatedVUs, maxVUs) => ({
  executor: 'ramping-arrival-rate',
  exec,
  startRate,
  timeUnit: '1s',
  preAllocatedVUs,
  maxVUs,
  stages: [
    { target: targets[0], duration: '20s' },
    { target: targets[1], duration: '20s' },
    { target: targets[2], duration: '20s' },
    { target: 0, duration: '10s' }
  ],
  gracefulStop: '15s',
  tags: { phase: 'measured' }
});

const warmupScenarios = {
  conversation_list: constantArrivalScenario('listConversations', 2, '15s', 4, 12, 'warmup'),
  message_list: constantArrivalScenario('listMessages', 4, '15s', 6, 20, 'warmup'),
  user_search: constantArrivalScenario('searchUsers', 2, '15s', 4, 12, 'warmup'),
  message_create: constantArrivalScenario('createMessage', 2, '15s', 4, 12, 'warmup')
};

const steadyStatePreconditioning = {
  profile: 'warmup',
  settleDelayMs: 2_000,
  scenarios: warmupScenarios
};

export const performanceProfiles = {
  warmup: {
    description: 'Deterministic preconditioning excluded from persisted performance results',
    metricPhase: 'warmup',
    persistResult: false,
    scenarios: warmupScenarios,
    thresholds: {
      ...reliabilityThresholds({
        phase: 'warmup',
        checks: 'rate==1',
        failures: 'rate==0',
        latency: 30_000,
        droppedIterations: true
      }),
      ...endpointThresholds('warmup', {
        conversation_list: 30_000,
        message_list: 30_000,
        user_search: 30_000,
        message_create: 30_000
      })
    }
  },
  smoke: {
    description: 'One correctness iteration for every HTTP workload',
    metricPhase: 'measured',
    scenarios: {
      conversation_list: smokeScenario('listConversations'),
      message_list: smokeScenario('listMessages'),
      user_search: smokeScenario('searchUsers'),
      message_create: smokeScenario('createMessage')
    },
    thresholds: {
      ...reliabilityThresholds({
        phase: 'measured',
        checks: 'rate==1',
        failures: 'rate==0',
        latency: 30_000
      }),
      ...endpointThresholds('measured', {
        conversation_list: 30_000,
        message_list: 30_000,
        user_search: 30_000,
        message_create: 30_000
      })
    }
  },
  baseline: {
    description: 'Low constant arrival rate used as the before-optimization baseline',
    metricPhase: 'measured',
    preconditioning: steadyStatePreconditioning,
    scenarios: {
      conversation_list: constantArrivalScenario('listConversations', 2, '120s', 4, 12),
      message_list: constantArrivalScenario('listMessages', 4, '120s', 6, 20),
      user_search: constantArrivalScenario('searchUsers', 2, '120s', 4, 12),
      message_create: constantArrivalScenario('createMessage', 2, '120s', 4, 12)
    },
    thresholds: {
      ...reliabilityThresholds({
        phase: 'measured',
        checks: 'rate>0.999',
        failures: 'rate<0.01',
        latency: 1_200,
        droppedIterations: true
      }),
      ...endpointThresholds('measured', {
        conversation_list: 1_200,
        message_list: 750,
        user_search: 500,
        message_create: 1_000
      })
    }
  },
  load: {
    description: 'Sustained expected traffic through two API instances',
    metricPhase: 'measured',
    preconditioning: steadyStatePreconditioning,
    scenarios: {
      conversation_list: constantArrivalScenario('listConversations', 10, '60s', 16, 50),
      message_list: constantArrivalScenario('listMessages', 20, '60s', 24, 80),
      user_search: constantArrivalScenario('searchUsers', 10, '60s', 16, 50),
      message_create: constantArrivalScenario('createMessage', 3, '60s', 12, 40)
    },
    thresholds: {
      ...reliabilityThresholds({
        phase: 'measured',
        checks: 'rate>0.999',
        failures: 'rate<0.01',
        latency: 2_000,
        droppedIterations: true
      }),
      ...endpointThresholds('measured', {
        conversation_list: 2_000,
        message_list: 1_200,
        user_search: 750,
        message_create: 1_800
      })
    }
  },
  stress: {
    description: 'Ramping traffic used to expose the saturation point',
    metricPhase: 'measured',
    preconditioning: steadyStatePreconditioning,
    scenarios: {
      conversation_list: stressScenario('listConversations', 2, [5, 10, 20], 20, 100),
      message_list: stressScenario('listMessages', 4, [10, 20, 40], 30, 150),
      user_search: stressScenario('searchUsers', 2, [5, 10, 20], 20, 100),
      message_create: stressScenario('createMessage', 1, [2, 4, 8], 16, 80)
    },
    thresholds: {
      ...reliabilityThresholds({
        phase: 'measured',
        checks: 'rate>0.99',
        failures: 'rate<0.02',
        latency: 30_000
      }),
      ...endpointThresholds('measured', {
        conversation_list: 30_000,
        message_list: 30_000,
        user_search: 30_000,
        message_create: 30_000
      })
    }
  }
};

export function getPerformanceProfile(name) {
  const profile = performanceProfiles[name];

  if (!profile) throw new Error(`Unknown performance profile: ${name}`);

  return profile;
}
