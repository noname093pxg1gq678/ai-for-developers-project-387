import { useEffect } from "react";
import { Link } from "react-router-dom";
import { Button, Container, Stack, Text, Title } from "@mantine/core";

const NOT_FOUND_TITLE = "Страница не найдена";

export default function NotFoundPage() {
  useEffect(() => {
    document.title = NOT_FOUND_TITLE;
  }, []);

  return (
    <Container size="sm" py="xl">
      <Title order={1} ta="center" mb="md">
        {NOT_FOUND_TITLE}
      </Title>
      <Text c="dimmed" ta="center" mb="xl">
        Такой страницы нет. Возможно, ссылка устарела.
      </Text>
      <Stack align="center">
        <Button component={Link} to="/" variant="light">
          Ко всем типам встреч
        </Button>
      </Stack>
    </Container>
  );
}
