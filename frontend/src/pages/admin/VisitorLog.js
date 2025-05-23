import React, { useEffect, useState } from 'react';
import {
  Box,
  Button,
  Container,
  Heading,
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  Text,
  Alert,
  AlertIcon,
  VStack,
  HStack,
  Stack,
  Spinner,
  Input,
  Select,
  useBreakpointValue,
} from '@chakra-ui/react';
import axios from 'axios';

function VisitorLog() {
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const isMobile = useBreakpointValue({ base: true, md: false });
  const [flats, setFlats] = useState([]);

  const fetchVisits = async () => {
    setLoading(true);
    setError('');
    try {
      const params = {};
      if (status) params.status = status;
      if (filter) params.filter = filter;
      if (search) params.search = search;
      const res = await axios.get('/api/visits', { params });
      setVisits(res.data);
    } catch (err) {
      setError('Failed to fetch visitor log');
    } finally {
      setLoading(false);
    }
  };

  const fetchFlats = async () => {
    try {
      const res = await axios.get('/api/flats');
      setFlats(res.data);
    } catch (err) {
      setError('Failed to fetch flats');
    }
  };

  useEffect(() => {
    fetchVisits();
    fetchFlats();
    // eslint-disable-next-line
  }, [status, filter, search]);

  // CSV export helper
  const exportToCSV = () => {
    if (!visits.length) return;
    const headers = [
      'Guest Name', 'Phone', 'Flat', 'Status', 'Purpose', 'Expected Arrival', 'Checked In At', 'Created At'
    ];
    const rows = visits.map(visit => [
      visit.name,
      visit.phone,
      getFlatDisplay(visit.flat_id, flats),
      visit.status,
      visit.purpose || '-',
      visit.expected_arrival ? new Date(visit.expected_arrival).toLocaleString() : '-',
      visit.checked_in_at ? new Date(visit.checked_in_at).toLocaleString() : '-',
      visit.created_at ? new Date(visit.created_at).toLocaleString() : '-'
    ]);
    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(','))
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'visitor_log.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Helper to get flat display string
  function getFlatDisplay(flat_id, flats) {
    const flat = flats.find(f => f.id === flat_id);
    if (!flat) return '-';
    return flat.unique_id || flat.number;
  }

  return (
    <Container maxW="container.xl" py={8}>
      <VStack spacing={6} align="stretch">
        <Heading size="lg" textAlign="center">Visitor Log</Heading>
        {error && <Alert status="error"><AlertIcon />{error}</Alert>}
        <Box bg="white" borderRadius="lg" boxShadow="sm" p={{ base: 4, md: 6 }} mb={6}>
          <VStack spacing={4} align="stretch" display={{ base: 'flex', md: 'none' }}>
            <Select value={status} onChange={e => setStatus(e.target.value)} w="100%">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="checked_in">Checked In</option>
              <option value="rejected">Rejected</option>
            </Select>
            <Select value={filter} onChange={e => setFilter(e.target.value)} w="100%">
              <option value="">All Dates</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </Select>
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search guest name or phone"
              w="100%"
            />
            <Button colorScheme="blue" w="100%" onClick={fetchVisits}>
              Search
            </Button>
            <Button colorScheme="green" w="100%" onClick={exportToCSV}>
              Export to CSV
            </Button>
          </VStack>
          <Stack direction={{ base: 'column', md: 'row' }} spacing={2} align="stretch" display={{ base: 'none', md: 'flex' }}>
            <Select value={status} onChange={e => setStatus(e.target.value)} maxW="180px">
          <option value="">All Statuses</option>
          <option value="pending">Pending</option>
          <option value="checked_in">Checked In</option>
          <option value="rejected">Rejected</option>
            </Select>
            <Select value={filter} onChange={e => setFilter(e.target.value)} maxW="180px">
          <option value="">All Dates</option>
          <option value="today">Today</option>
          <option value="week">This Week</option>
          <option value="month">This Month</option>
            </Select>
            <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search guest name or phone"
              maxW="250px"
        />
            <Button colorScheme="blue" onClick={fetchVisits}>
              Search
            </Button>
            <Button colorScheme="green" onClick={exportToCSV}>
              Export to CSV
            </Button>
          </Stack>
        </Box>
      {loading ? (
          <Box textAlign="center" py={10}><Spinner size="xl" /></Box>
      ) : visits.length === 0 ? (
          <Box textAlign="center" py={12} bg="white" borderRadius="lg" boxShadow="sm">
            <Text color="gray.500" fontSize="lg">No visitor records found</Text>
          </Box>
        ) : isMobile ? (
          <VStack spacing={4} align="stretch">
            {visits.map((visit) => (
              <Box key={visit.id} p={5} borderWidth={1} borderRadius="lg" boxShadow="sm" bg="white">
                <Stack spacing={2}>
                  <Text fontWeight="bold">{visit.name}</Text>
                  <Text fontSize="sm" color="gray.600">Phone: {visit.phone}</Text>
                  <Text fontSize="sm" color="gray.600">Flat: {getFlatDisplay(visit.flat_id, flats)}</Text>
                  <Text fontSize="sm" color="gray.600">Status: <b>{visit.status.replace('_', ' ')}</b></Text>
                  <Text fontSize="sm" color="gray.600">Purpose: {visit.purpose || '-'}</Text>
                  <Text fontSize="sm" color="gray.600">Expected Arrival: {visit.expected_arrival ? new Date(visit.expected_arrival).toLocaleString() : '-'}</Text>
                  <Text fontSize="sm" color="gray.600">Checked In At: {visit.checked_in_at ? new Date(visit.checked_in_at).toLocaleString() : '-'}</Text>
                  <Text fontSize="sm" color="gray.600">Created At: {visit.created_at ? new Date(visit.created_at).toLocaleString() : '-'}</Text>
                </Stack>
              </Box>
            ))}
          </VStack>
        ) : (
          <Box overflowX="auto" bg="white" borderRadius="lg" boxShadow="sm">
            <Table variant="simple">
              <Thead bg="gray.50">
                <Tr>
                  <Th>Guest Name</Th>
                  <Th>Phone</Th>
                  <Th>Flat</Th>
                  <Th>Status</Th>
                  <Th>Purpose</Th>
                  <Th>Expected Arrival</Th>
                  <Th>Checked In At</Th>
                  <Th>Created At</Th>
                </Tr>
              </Thead>
              <Tbody>
              {visits.map((visit) => (
                  <Tr key={visit.id}>
                    <Td py={4}>{visit.name}</Td>
                    <Td py={4}>{visit.phone}</Td>
                    <Td py={4}>{getFlatDisplay(visit.flat_id, flats)}</Td>
                    <Td py={4}>
                      <Text as="span" px={2} py={1} fontSize="xs" fontWeight="semibold" borderRadius="full" bg={
                        visit.status === 'pending' ? 'yellow.100' :
                        visit.status === 'checked_in' ? 'green.100' :
                        visit.status === 'rejected' ? 'red.100' : 'gray.100'
                      } color={
                        visit.status === 'pending' ? 'yellow.800' :
                        visit.status === 'checked_in' ? 'green.800' :
                        visit.status === 'rejected' ? 'red.800' : 'gray.800'
                      }>
                      {visit.status.replace('_', ' ')}
                      </Text>
                    </Td>
                    <Td py={4}>{visit.purpose || '-'}</Td>
                    <Td py={4}>{visit.expected_arrival ? new Date(visit.expected_arrival).toLocaleString() : '-'}</Td>
                    <Td py={4}>{visit.checked_in_at ? new Date(visit.checked_in_at).toLocaleString() : '-'}</Td>
                    <Td py={4}>{visit.created_at ? new Date(visit.created_at).toLocaleString() : '-'}</Td>
                  </Tr>
              ))}
              </Tbody>
            </Table>
          </Box>
      )}
      </VStack>
    </Container>
  );
}

export default VisitorLog; 