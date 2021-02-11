import { useEffect, useState } from 'react'
import { useQuery, useSubscription, gql } from '@apollo/client';
import { Container, Row, Col, Card, Table, Pagination, Form, Spinner, Alert } from 'react-bootstrap';
import { Line, defaults } from 'react-chartjs-2';

defaults.global.animation = false;

const SPREADS_QUERY = gql`
  query Spreads($first: Int!, $offset: Int!){
    spreads(first: $first, offset: $offset) {
      pageInfo {
        hasPreviousPage
        hasNextPage
      }
      edges {
        node {
          id
          pair {
            pk
            name
            pairA {
              name
            }
            pairB {
              name
            }
          }
          buySpread
          sellSpread
          timestamp
        }
      }
    }
  }
`;

const CHART_PAIRS_SPREADS_QUERY = gql`
  query ChartPairsSpreads(
    $pairsParams: [PairInput]!, 
    $timeFrame: String!,
    $startDate: DateTime,
    $endDate: DateTime
  ) {
    chartPairsSpreads(
      pairsParams: $pairsParams, 
      timeFrame: $timeFrame,
      startDate: $startDate,
      endDate: $endDate
    ) {
      buySpread
      sellSpread
      timestamp   
      pair
    }
  }
`;

const SPREADS_SUBSCRIPTION = gql`
  subscription Spread($pairsIds: [ID]!){
    spread(pairsIds: $pairsIds) {
      spread {
        buySpread
        sellSpread
        timestamp
        pair {
          pk
          name
        }
      }
    }
  }
`;

export default function App() {
  const [count, setCount] = useState(6);
  const [page, setPage] = useState(1);
  const [timeFrame, setTimeFrame] = useState('minute');
  const [endDate, setEndDate] = useState(null);
  const [startDate, setStartDate] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [selectedSpreads, setSelectedSpreads] = useState([]);
  const [colors, setColors] = useState([]);

  const { loading, error, data } = useQuery(SPREADS_QUERY, {
    variables: {
      first: count,
      offset: count * (page - 1)
    }
  });
  const chartPairsSpreadsQuery = useQuery(CHART_PAIRS_SPREADS_QUERY, {
    variables: {
      pairsParams: selectedSpreads.map(spread => {
        return {
          id: spread.spread.pair.pk,
          buyOrSell: spread.buyOrSell
        }
      }),
      timeFrame,
      startDate,
      endDate
    }
  });

  useEffect(() => {
    if (isLive) {
      setTimeFrame('minute');
    }
  }, [isLive]);

  const onSpreadSelectChange = (selected, spread, buyOrSell) => {
    if (selected) {
      setSelectedSpreads(currSpreads => [...currSpreads, { spread, buyOrSell }]);
    } else {
      setSelectedSpreads(currSpreads => currSpreads.filter(_spread => {
        return (_spread.spread.pair.pk !== spread.pair.pk) || (_spread.buyOrSell !== buyOrSell);
      }));
    }
  }

  let chartData = {};
  if (chartPairsSpreadsQuery.data && (!chartPairsSpreadsQuery.error || !chartPairsSpreadsQuery.loading)) {
    chartData = {
      datasets: chartPairsSpreadsQuery.data.chartPairsSpreads.map((chartPairSpreads, index) => {
        const pairId = chartPairSpreads[0]?.pair;
        const buyOrSell = (chartPairSpreads[0]?.buySpread) ? 'buy' : 'sell';
        const spread = selectedSpreads.find(selectedSpread => {
          return (selectedSpread.spread.pair.pk === pairId) && (selectedSpread.buyOrSell === buyOrSell);
        });
        const pairName = spread.spread.pair.name;
        const label = `${pairName} (${spread.buyOrSell})`;
        let borderColor = '';
        if (!colors[index]) {
          setColors(currColors => [...currColors.slice(0, index), getRandomColor(), ...currColors.slice(index + 1)]);
        }
        borderColor = colors[index];
        return {
          label,
          data: chartPairSpreads.map(chartPairSpread => ({ 
            x: chartPairSpread.timestamp, 
            y: toPercentage((chartPairSpread.buySpread) ? chartPairSpread.buySpread : chartPairSpread.sellSpread)
          })),
          fill: false,
          borderColor
        }
      })
    };
  }

  const liveData = useSubscription(SPREADS_SUBSCRIPTION, {
    variables: {
      pairsIds: selectedSpreads.map(spread => spread.spread.pair.pk) 
    }
  });

  if (liveData.data && (!liveData.error || !liveData.loading)) {
    if (isLive) {
      const receivedSpread = liveData.data.spread.spread;
      const pairId = receivedSpread.pair.pk;
      const spreads = selectedSpreads.filter(selectedSpread => selectedSpread.spread.pair.pk === pairId);
      spreads.forEach(spread => {
        const pairName = spread.spread.pair.name;
        const label = `${pairName} (${spread.buyOrSell})`;
        const dataset = chartData.datasets?.find(dataset => dataset.label === label);
        dataset.data.push({ 
          x: receivedSpread.timestamp, 
          y: toPercentage((spread.buyOrSell === 'buy') ? receivedSpread.buySpread : receivedSpread.sellSpread)
        });
      });
    }
  }

  if (error) return <Alert variant="danger" className="my-4 container">Server error! Please refresh.</Alert>;
  
  return (
    <Container className="my-4">
      <Row>
        <Col md={12}>
          <Card className="mb-4">
            <Card.Body>
              <Line data={chartData} options={{
                  responsive: true,
                  scales: {
                    xAxes: [{
                      type: 'time',
                      time: {
                        unit: timeFrame,
                        displayFormats: {
                          minute: 'H:mm',
                          hour: 'ddd H:mm',
                          day: 'MMM D H:mm',
                          week: 'MMM YYYY',
                          month: 'MMM YYYY',
                          year: 'MMM YYYY',
                        }
                      }
                    }]
                  }
                }}
              />
              <div className="d-flex align-items-center mt-2">
                <div className="mr-3">
                  <Form.Control as="select" custom disabled={isLive} value={timeFrame} onChange={(e) => setTimeFrame(e.currentTarget.value)}>
                    <option value="minute">Minute</option>
                    <option value="hour">Hour</option>
                    <option value="day">Day</option>
                    <option value="week">Week</option>
                    <option value="month">Month</option>
                    <option value="year">Year</option>
                  </Form.Control>
                </div>
                <div className="mr-3">
                  <input 
                    type="datetime-local" 
                    className="px-2 py-1 rounded border" 
                    value={startDate}
                    onChange={e => setStartDate(e.currentTarget.value)}
                    disabled={isLive}
                  />
                </div>
                <div className="mr-3">
                  <input 
                    type="datetime-local" 
                    className="px-2 py-1 rounded border"
                    value={endDate} 
                    onChange={e => setEndDate(e.currentTarget.value)}
                    disabled={isLive}
                  />
                </div>
                <div className="mr-3">
                  <Form.Check
                    custom
                    type="checkbox"
                    label="Live"
                    checked={isLive}
                    onChange={e => setIsLive(e.currentTarget.checked)}
                    id="live-toggle"
                  />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Col>
        <Col md={12}>
          <Card>
          {loading ? (
              <div className="text-center my-5">
                <Spinner animation="border" role="status">
                  <span className="sr-only">Loading...</span>
                </Spinner>
              </div>  
          ) : (

              <Table responsive hover>
              <thead className="text-uppercase small">
                <tr>
                  <th colSpan={2}>Spread Pair</th>
                  <th>Buy Spread</th>
                  <th>Sell Spread</th>
                </tr>
              </thead>
              <tbody>
                {data.spreads?.edges.map(edge => edge.node).map(spread => (
                  <tr key={spread.id}>
                    <td>{spread.pair.pairA.name}</td>
                    <td>{spread.pair.pairB.name}</td>
                    <td>
                    <Form.Check
                      custom
                      type="checkbox"
                      label={(
                        <span className={`${(spread.buySpread < 0) ? 'text-danger' : 'text-success'} font-weight-bold`}>
                          {toPercentage(spread.buySpread)}%
                        </span>
                      )}
                      onChange={e => onSpreadSelectChange(e.currentTarget.checked, spread, 'buy')}
                      id={`${spread.id}-buySpread`}
                      disabled={isLive}
                    />
                    </td>
                    <td>
                    <Form.Check
                      custom
                      type="checkbox"
                      label={(
                        <span className={`${(spread.sellSpread < 0) ? 'text-danger' : 'text-success'} font-weight-bold`}>
                          {toPercentage(spread.sellSpread)}%
                        </span>
                      )}
                      onChange={e => onSpreadSelectChange(e.currentTarget.checked, spread, 'sell')}
                      id={`${spread.id}-sellSpread`}
                      disabled={isLive}
                    />
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
            <Row className="w-100 mx-1">
              <Col md={1}>
                  <Form.Control type="number" step={1} value={count} onChange={e => setCount(e.currentTarget.value)} />
              </Col>
              <Col md={1}>
                <Pagination>
                  <Pagination.Prev disabled={page === 1} onClick={() => setPage(currPage => currPage - 1)} />
                  <Pagination.Next disabled={page * count === 100} onClick={() => setPage(currPage => currPage + 1)} />
                </Pagination>
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </Container>
  )
}


function toPercentage(value) {
  return (value * 100).toFixed(2);
}

function getRandomColor() {
  let r = Math.floor(Math.random() * 255);
  let g = Math.floor(Math.random() * 255);
  let b = Math.floor(Math.random() * 255);
  return `rgb(${r}, ${g}, ${b})`;
}