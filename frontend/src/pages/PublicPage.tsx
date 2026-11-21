import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Button,
  Card,
  Container,
  Skeleton,
  Stack,
  Text,
  Title,
} from "@mantine/core";
import {
  OWNER_NAME,
  PUBLIC_PAGE_DESCRIPTION,
  PUBLIC_PAGE_TITLE,
} from "../config";
import { loadMeetingTypes } from "../data/publicApi";
import { formatDuration } from "../lib/format";
import { setMetaDescription } from "../lib/meta";

import type { MeetingType } from "../api";

type LoadStatus = "loading" | "ready" | "error";

const SKELETON_CARDS = 3;

export default function PublicPage() {
  const [status, setStatus] = useState<LoadStatus>("loading");
  const [types, setTypes] = useState<MeetingType[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    document.title = PUBLIC_PAGE_TITLE;
    setMetaDescription(PUBLIC_PAGE_DESCRIPTION);
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadMeetingTypes()
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        setTypes(loaded);
        setStatus("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setStatus("loading");
    setAttempt((current) => current + 1);
  };

  return (
    <Container size="sm" py="xl">
      <Title order={1} ta="center" mb="xl">
        {OWNER_NAME}
      </Title>
      {status === "loading" && (
        <Stack gap="md">
          {Array.from({ length: SKELETON_CARDS }, (_, index) => (
            <Skeleton key={index} height={96} radius="md" />
          ))}
        </Stack>
      )}
      {status === "error" && (
        <Stack align="center" gap="sm">
          <Text c="red">Не удалось загрузить типы встреч</Text>
          <Button variant="light" onClick={retry}>
            Повторить
          </Button>
        </Stack>
      )}
      {status === "ready" && types.length === 0 && (
        <Text c="gray.7" ta="center">
          Пока нет доступных типов встреч
        </Text>
      )}
      {status === "ready" && types.length > 0 && (
        <Stack gap="md">
          {types.map((type) => (
            <Card
              key={type.id}
              component={Link}
              to={`/book/${type.id}`}
              withBorder
              padding="lg"
              radius="md"
            >
              <Text size="lg" fw={600}>
                {type.title}
              </Text>
              <Text size="sm" c="gray.7">
                {type.description}
              </Text>
              <Text size="sm" c="gray.7" mt="xs">
                {formatDuration(type.durationMinutes)}
              </Text>
            </Card>
          ))}
        </Stack>
      )}
    </Container>
  );
}
