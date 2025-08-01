import React, { useState } from "react";
import { Image } from "react-native";
import {
  NativeBaseProvider,
  Box,
  VStack,
  Input,
  Button,
  Text,
  Toast,
} from "native-base";
import { LinearGradient } from "expo-linear-gradient";

export default function App() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!email || !email.includes("@")) {
      Toast.show({
        title: "Invalid email",
        status: "warning",
      });
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch("https://formsubmit.co/3dc4842116379509a3ba0bc4ccb46e00", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: email,
          _subject: "New app waitlist signup!",
        }),
      });

      if (response.ok) {
        Toast.show({
          title: "You're on the waitlist!",
          status: "success",
        });
        setEmail(""); // clear the input
      } else {
        Toast.show({
          title: "Submission failed. Try again.",
          status: "error",
        });
      }
    } catch (error) {
      Toast.show({
        title: "Network error.",
        status: "error",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <NativeBaseProvider>
      <LinearGradient
        colors={["#0D0C1F", "#1F233A"]}
        style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 24 }}
      >
        <VStack space={6} alignItems="center" width="100%">
          <Image
            source={require("./assets/logo.png")}
            style={{ width: 150, height: 150, resizeMode: "contain" }}
          />
          <Text color="white" fontSize="xl" textAlign="center">
            Welcome to Inner — your sanctuary within.
          </Text>

          <Input
  placeholder="Enter your email"
  variant="filled"
  width="90%"
  bg="white"
  borderRadius="md"
  py={3}
  px={4}
  fontSize="md"
  value={email}
  onChangeText={setEmail}
  keyboardType="email-address"
  autoCapitalize="none"
  borderWidth={0}
/>


          <Button
            isLoading={submitting}
            onPress={handleSubmit}
            bg="indigo.600"
            _pressed={{ bg: "indigo.700" }}
            px={6}
            py={3}
            borderRadius="md"
            width="90%"
          >
            Join the Waitlist
          </Button>
        </VStack>
      </LinearGradient>
    </NativeBaseProvider>
  );
}

