import tempfile
import unittest
from pathlib import Path

import local_demo


class FakeRequest:
    def __init__(self, method, data=None, authorized=True):
        self.command = method
        self.headers = ({'Authorization': 'Bearer lifehub-local-demo-token'}
                        if authorized else {})
        self.data = data
        self.response = None

    def body_json(self):
        return self.data

    def send_json(self, data, status=200):
        self.response = (status, data)
        return self.response


class LocalDemoApiTests(unittest.TestCase):
    def setUp(self):
        self.tempdir = tempfile.TemporaryDirectory()
        self.previous_db_path = local_demo.DB_PATH
        local_demo.DB_PATH = Path(self.tempdir.name) / 'test.sqlite3'
        local_demo.initialize()

    def tearDown(self):
        local_demo.DB_PATH = self.previous_db_path
        self.tempdir.cleanup()

    def call_api(self, method, path, data=None, authorized=True):
        request = FakeRequest(method, data, authorized)
        local_demo.Handler.api(request, path)
        return request.response

    def test_requires_demo_bearer_token(self):
        status, body = self.call_api('GET', '/state', authorized=False)
        self.assertEqual(status, 401)
        self.assertIn('error', body)

    def test_five_tools_persist_and_mutate(self):
        self.assertEqual(self.call_api('POST', '/expenses', {'title': '午餐', 'amount': 120})[0], 201)
        self.assertEqual(self.call_api('POST', '/todos', {'title': '買牛奶'})[0], 201)
        self.assertEqual(self.call_api('POST', '/water', {'amount': 300})[0], 201)
        self.assertEqual(self.call_api('PUT', '/water/goal', {'goal': 2200})[0], 200)
        self.assertEqual(self.call_api('POST', '/shopping', {'title': '雞蛋'})[0], 201)
        self.assertEqual(self.call_api('POST', '/habits', {'title': '運動'})[0], 201)

        state = self.call_api('GET', '/state')[1]
        expense_id = next(row['id'] for row in state['expenses'] if row['title'] == '午餐')
        todo_id = next(row['id'] for row in state['todos'] if row['title'] == '買牛奶')
        shopping_id = next(row['id'] for row in state['shopping'] if row['title'] == '雞蛋')
        habit_id = next(row['id'] for row in state['habits'] if row['title'] == '運動')

        self.assertEqual(state['expenseTotal'], 120)
        self.assertEqual(state['waterToday'], 300)
        self.assertEqual(state['waterGoal'], 2200)
        self.assertEqual(self.call_api('PATCH', f'/todos/{todo_id}', {'done': True})[0], 200)
        self.assertEqual(self.call_api('PATCH', f'/shopping/{shopping_id}', {'checked': True})[0], 200)
        self.assertEqual(self.call_api('POST', f'/habits/{habit_id}/check', {})[0], 200)

        state = self.call_api('GET', '/state')[1]
        self.assertTrue(next(row for row in state['todos'] if row['id'] == todo_id)['done'])
        self.assertTrue(next(row for row in state['shopping'] if row['id'] == shopping_id)['checked'])
        habit = next(row for row in state['habits'] if row['id'] == habit_id)
        self.assertTrue(habit['checkedToday'])
        self.assertEqual(habit['streak'], 1)

        self.assertEqual(self.call_api('DELETE', f'/expenses/{expense_id}')[0], 200)
        self.assertEqual(self.call_api('GET', '/state')[1]['expenseTotal'], 0)
        self.assertEqual(self.call_api('DELETE', f'/todos/{todo_id}')[0], 200)
        self.assertEqual(self.call_api('DELETE', f'/shopping/{shopping_id}')[0], 200)
        self.assertEqual(self.call_api('DELETE', f'/habits/{habit_id}')[0], 200)


if __name__ == '__main__':
    unittest.main()
